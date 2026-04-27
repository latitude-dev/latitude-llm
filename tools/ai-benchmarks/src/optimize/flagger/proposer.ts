import { AI } from "@domain/ai"
import {
  hashOptimizationCandidateText,
  type OptimizationCandidate,
  type OptimizationTrajectory,
} from "@domain/optimizations"
import { type Cause, Data, Effect } from "effect"
import { z } from "zod"
import { computeCost } from "../../runner/pricing.ts"

/**
 * Flagger-local proposer model. Distinct from `@platform/op-gepa`'s
 * `GEPA_PROPOSER_MODEL` (which the eval-flow optimizer uses) so we can
 * iterate on speed/quality here without affecting the workflows app.
 *
 * Sonnet 4-6 chosen for the flagger optimizer because the proposer's
 * task — rewriting a strategy `.ts` file given concrete trajectory
 * feedback — doesn't need Opus-tier reasoning, and Sonnet is ~3-5×
 * faster per call (~5× cheaper) on Bedrock. Has the explicit capability
 * entry in `@ai-sdk/anthropic` (`supportsStructuredOutput: true`,
 * `supportsAdaptiveThinking: true`), so the structured-output path
 * works without tripping the Opus-4-7 `output_config.format` issue
 * filed upstream as vercel/ai#14773.
 */
export const FLAGGER_PROPOSER_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-opus-4-6-v1",
  reasoning: "high",
} as const

/**
 * Flagger proposer: given the current strategy `.ts` file and the
 * trajectories from the prior evaluate pass, ask Opus 4.7 to return a
 * complete replacement file.
 *
 * Why "complete file" rather than a JSON-shaped patch:
 * see spec §"S1 — Should GEPA tune more than the system prompt?". TL;DR:
 * the artifact GEPA optimizes is the same artifact that ships, so the
 * proposer reads + emits the full source. Git diff at adoption time is the
 * reviewable record at the source-of-truth level.
 */

const flaggerProposerOutputSchema = z.object({
  reasoning: z
    .string()
    .min(1)
    .describe(
      "Concrete rationale: which trajectories drove which edits, what gap each edit addresses. Surface 'I would have used X' suggestions here for the human reviewer.",
    ),
  fileText: z
    .string()
    .min(1)
    .describe(
      "Complete new TypeScript source for the strategy file. No markdown fences. The file must export the named QueueStrategy with all four methods.",
    ),
})

/**
 * Tagged error for the candidate-text hashing step. Distinct from AI
 * errors so the Effect chain preserves type-level distinction even if
 * we ever consumed errors directly instead of via the catch-all
 * `catchCause` at the bottom of `callFlaggerProposer`.
 */
class FlaggerProposerHashError extends Data.TaggedError("FlaggerProposerHashError")<{
  readonly cause: unknown
}> {}

type ProposerPhase = "preparing" | "calling" | "received" | "hashing"

interface FlaggerProposerInput {
  readonly currentFileText: string
  readonly currentCandidate: OptimizationCandidate
  readonly trajectories: readonly OptimizationTrajectory[]
  readonly operatorNotes: string | null
  readonly queueSlug: string
  readonly exportName: string
  readonly maxTrajectories: number
  readonly onPhase?: (phase: ProposerPhase) => void
}

export interface FlaggerProposerResult {
  readonly candidate: OptimizationCandidate
  readonly reasoning: string
  readonly costUsd: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly reasoningTokens: number
}

const buildSystemPrompt = (input: { readonly queueSlug: string; readonly exportName: string }): string =>
  `You optimize a Latitude flagger strategy file used in production trace classification.

You receive:
- the full TypeScript source of the current strategy file
- a JSON-encoded set of evaluation trajectories (each row's expected/predicted verdicts, the deterministic-phase signals, and the LLM verdict if reached)

You must return reasoning and a complete replacement file per the output schema.

The file you return MUST:
- Export "${input.exportName}: QueueStrategy" with four methods: hasRequiredContext, detectDeterministically, buildSystemPrompt, buildPrompt.
- Compile as valid TypeScript with no markdown fences in the output.
- Only import from modules already declared in the strategy package's package.json (workspace modules under @domain/*, @repo/*, and any npm package the package already depends on). Relative imports must stay inside the flagger-strategies directory.
- Avoid any of: process.*, globalThis writes, eval, Function constructor, dynamic import(), require(), child_process, fs, net, vm, or any node:* builtin.
- Keep the strategy compatible with the QueueStrategy interface contract.

You may freely:
- Restructure helpers, rename internal functions, replace regex with a different deterministic check inside detectDeterministically, rewrite the system prompt, change the suspicious-snippet extractor, etc. — as long as the four exported methods remain present.

You may surface "I would have used X" notes in the reasoning field. The reviewer reads reasoning at adoption time and may decide to install a new dependency before re-running.

Trajectory schema reminder: each trajectory's "feedback" string is JSON-encoded and contains:
- expected, predicted (booleans)
- phase: deterministic-{match,no-match}, llm-{match,no-match}, schema-mismatch, error, or candidate-rejected
- tags (e.g. tactic labels)
- preFilter: { highPrecisionMatched, extractedSnippets } — what the candidate's deterministic methods returned
- llmVerdict: non-null only on llm-* phases
- rejection: { stage, reason } — present only when phase is candidate-rejected. \`stage\` is one of: static-scan, compile, import, shape, runtime. \`reason\` is the literal failure message.

When phase is deterministic-no-match, the LLM never saw the row — so the regex/pre-filter is the layer to fix. When phase is llm-* and the verdict is wrong, the prompt or buildPrompt context is the layer to fix. When phase is candidate-rejected, the previous candidate failed to even compile/load — read \`rejection.reason\` and address THAT specific failure (e.g. "Import 'tldts' does not resolve" → drop the offending import). Multiple rows will carry the same rejection reason if the candidate failed wholesale; treat them as a single signal.

Be SURGICAL. Strong preference for the smallest viable change:
- If the trajectories point at a single regex pattern, change ONLY that pattern. Do not refactor unrelated helpers.
- If the trajectories point at the LLM prompt, change ONLY the prompt. Leave the deterministic phase byte-for-byte identical.
- If only one tactic class is failing (e.g. persona-aim), edit only the patterns and prompt sections that target it.
- Preserve unchanged code verbatim — do not rewrite functions just for taste, naming, or formatting. Smaller diffs review faster, ship faster, and are easier to revert.
- Wholesale rewrites are acceptable ONLY when the trajectories clearly show a structural problem (e.g. the pre-filter and the prompt are both wrong on overlapping rows). State that case explicitly in the reasoning field.

Prefer concrete, testable changes that the trajectories justify over speculative rewrites.`

const buildOperatorNotesSection = (notes: string | null): string => {
  if (notes === null || notes.trim().length === 0) return ""
  return `\n\nOperator notes (treat as preferences, not hard constraints — the static scan still validates structure regardless):\n${notes.trim()}\n`
}

const formatTrajectories = (trajectories: readonly OptimizationTrajectory[], maxRows: number): string => {
  if (trajectories.length === 0)
    return "No prior trajectories available — make a conservative improvement to the current file."
  const total = trajectories.length
  const sliced = trajectories.slice(0, maxRows)
  const summary =
    total > sliced.length ? `Showing ${sliced.length} of ${total} trajectories.` : `${total} trajectories.`
  const rendered = sliced
    .map((t, idx) => {
      const lines = [
        `[${idx + 1}] id=${t.id} score=${t.score} expected=${t.expectedPositive} predicted=${t.predictedPositive}`,
        `feedback=${t.feedback}`,
        `conversation:`,
        t.conversationText,
      ]
      return lines.join("\n")
    })
    .join("\n\n---\n\n")
  return `${summary}\n\n${rendered}`
}

const buildUserPrompt = (input: FlaggerProposerInput): string => {
  const sections: string[] = [
    `Target: flaggers:${input.queueSlug}`,
    `Required export: ${input.exportName} (QueueStrategy)`,
    "",
    "Current strategy file:",
    "```ts",
    input.currentFileText,
    "```",
    "",
    "Trajectories:",
    formatTrajectories(input.trajectories, input.maxTrajectories),
    "",
    "Return reasoning and a complete fileText per the schema.",
  ]

  return sections.join("\n")
}

export const callFlaggerProposer = (input: FlaggerProposerInput): Effect.Effect<FlaggerProposerResult, never, AI> =>
  Effect.gen(function* () {
    const ai = yield* AI
    input.onPhase?.("preparing")
    const systemPrompt = buildSystemPrompt({ queueSlug: input.queueSlug, exportName: input.exportName })
    const operatorNotes = buildOperatorNotesSection(input.operatorNotes)
    const userPrompt = buildUserPrompt(input)

    input.onPhase?.("calling")
    const result = yield* ai.generate({
      model: FLAGGER_PROPOSER_MODEL.model,
      provider: FLAGGER_PROPOSER_MODEL.provider,
      /* reasoning: FLAGGER_PROPOSER_MODEL.reasoning, */
      system: `${systemPrompt}${operatorNotes}`,
      prompt: userPrompt,
      schema: flaggerProposerOutputSchema,
    })
    input.onPhase?.("received")

    const usage = result.tokenUsage ?? { input: 0, output: 0 }
    const cost = computeCost(FLAGGER_PROPOSER_MODEL.provider, FLAGGER_PROPOSER_MODEL.model, {
      input: usage.input ?? 0,
      output: usage.output ?? 0,
      reasoning: usage.reasoning ?? 0,
      cacheRead: usage.cacheRead ?? 0,
      cacheWrite: usage.cacheWrite ?? 0,
      attempts: 1,
      successes: 1,
    })

    const fileText = result.object.fileText.replace(/^\s*```(?:ts|typescript)?\s*\n?/u, "").replace(/\n?```\s*$/u, "")
    input.onPhase?.("hashing")
    const hash = yield* Effect.tryPromise({
      try: () => hashOptimizationCandidateText(fileText),
      catch: (cause: unknown) => new FlaggerProposerHashError({ cause }),
    })

    const candidate: OptimizationCandidate = {
      componentId: input.currentCandidate.componentId,
      text: fileText,
      hash,
    }

    return {
      candidate,
      reasoning: result.object.reasoning,
      costUsd: typeof cost.totalUsd === "number" ? cost.totalUsd : 0,
      inputTokens: usage.input ?? 0,
      outputTokens: usage.output ?? 0,
      reasoningTokens: usage.reasoning ?? 0,
    } satisfies FlaggerProposerResult
  }).pipe(
    Effect.catchCause((cause: Cause.Cause<unknown>) =>
      Effect.sync(() => {
        // The propose path swallows AI / hashing errors and surfaces them as
        // a sentinel result (empty fileText + reasoning carrying the cause)
        // so the retry loop in benchmark-optimize can detect the failure
        // and feed it back to the next proposer attempt.
        const reason = String(cause).slice(0, 500)
        return {
          candidate: {
            componentId: input.currentCandidate.componentId,
            text: "",
            hash: "",
          },
          reasoning: `[proposer-error] ${reason}`,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
        } satisfies FlaggerProposerResult
      }),
    ),
  )
