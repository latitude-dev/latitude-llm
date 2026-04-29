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
 *
 * `reasoningConfig` is the Bedrock-native thinking knob (typed at
 * `@ai-sdk/amazon-bedrock` → `amazonBedrockLanguageModelOptions`). We use
 * it directly instead of the abstract top-level `reasoning: "high"` for
 * two reasons:
 *
 * 1. Wall-time control. The abstract `"high"` level corresponds to a
 *    ~16K-token thinking budget on Opus 4.6, which streams at ~50–100
 *    tokens/sec on Bedrock → ~120–180s per propose call. Our optimization
 *    runs do many propose calls, and that wait dominates wall time.
 *    `budgetTokens: 8192` gives us a precise ~60–90s middle point that
 *    isn't reachable through the level enum (which only exposes ~4K
 *    "medium" and ~16K "high").
 * 2. `display: "summarized"` cuts wire bytes — Bedrock returns a short
 *    summary of the thinking channel instead of streaming the full chain.
 *    Saves a few seconds of streaming time. Note: this does NOT reduce
 *    billing — Anthropic charges for thinking tokens generated regardless
 *    of what's transmitted. Worth setting anyway for cleaner network
 *    behavior and smaller debug-log payloads.
 *
 * The structured `reasoning` field in `flaggerProposerOutputSchema` is the
 * auditable rationale we surface to reviewers; the Bedrock thinking
 * channel is internal-only and discarded. Keep `budgetTokens` in line
 * with how much *internal* deliberation you want; bump it (up to 16K) if
 * proposed candidates start looking shallow on hard reflections.
 */
export const FLAGGER_PROPOSER_MODEL = {
  provider: "amazon-bedrock",
  model: "anthropic.claude-opus-4-6-v1",
  reasoningConfig: {
    type: "enabled",
    budgetTokens: 4096,
    display: "summarized",
  },
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
      "Complete new TypeScript source for the strategy file. No markdown fences. The file must export the named FlaggerStrategy with all four methods.",
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
  /**
   * Hard cap on the returned file's character count. The candidate-loader
   * static-scan stage rejects anything larger; we surface the number to
   * the proposer so it can size its rewrite intentionally instead of
   * discovering the cap via repeated rejections.
   */
  readonly maxBytes: number
  /**
   * Baseline file size in characters — the anchor `maxBytes` is computed
   * from. The proposer needs both numbers to reason about budget headroom
   * (file is currently X chars, cap is Y chars, baseline was Z chars).
   */
  readonly baselineBytes: number
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
- Export "${input.exportName}: FlaggerStrategy" with four methods: hasRequiredContext, detectDeterministically, buildSystemPrompt, buildPrompt.
- Compile as valid TypeScript with no markdown fences in the output.
- Only import from modules already declared in the strategy package's package.json (workspace modules under @domain/*, @repo/*, and any npm package the package already depends on). Relative imports must stay inside the flagger-strategies directory.
- Avoid any of: process.*, globalThis writes, eval, Function constructor, dynamic import(), require(), child_process, fs, net, vm, or any node:* builtin.
- NEVER use catastrophic-backtracking regex. This is a HARD constraint and the single biggest risk for this strategy file. Forbidden: nested unbounded quantifiers — any \`*\` or \`+\` quantified group whose body itself contains another unbounded quantifier on overlapping characters. Patterns that ALL hang Node's regex engine on adversarial input and are auto-rejected by the static scan: (a+)+, (.*)*, (.+)*, (\\w+)+, (\\S*)*, (\\d*)*, (.|\\s)*. They block the event loop synchronously — the per-method 5s timeout cannot interrupt sync regex hangs — so a single bad pattern freezes the entire run, not just one row. If you need repeated matching, use a single quantifier on a non-overlapping character class (e.g. [a-z]+ instead of (\\w+)+), bound the inner repetition (e.g. \\w{1,32} instead of \\w+), or split the match into multiple anchored passes. The trace text is adversarial (real jailbreak attempts) — assume any pattern that CAN be exploited WILL be.
- Keep the strategy compatible with the FlaggerStrategy interface contract.

You may freely:
- Restructure helpers, rename internal functions, replace regex with a different deterministic check inside detectDeterministically, rewrite the system prompt, change the suspicious-snippet extractor, etc. — as long as the four exported methods remain present.

You may surface "I would have used X" notes in the reasoning field. The reviewer reads reasoning at adoption time and may decide to install a new dependency before re-running.

Trajectory schema reminder: each trajectory's "feedback" string is JSON-encoded and contains:
- expected, predicted (booleans)
- phase: deterministic-{match,no-match}, llm-{match,no-match}, schema-mismatch, error, or candidate-rejected
- tags (e.g. tactic labels)
- preFilter: { kind: "matched" | "no-match" | "ambiguous" | "no-required-context" | "no-detect-method", feedback?: string } — what the candidate's deterministic layer returned. "no-required-context" means hasRequiredContext returned false (or threw); "no-detect-method" means detectDeterministically threw; "ambiguous" means the deterministic layer deferred to the LLM.
- llmVerdict: non-null only on llm-* phases
- rejection: { stage, reason } — present only when phase is candidate-rejected. \`stage\` is one of: static-scan, compile, import, shape. \`reason\` is the literal failure message (esbuild output, import resolution error, or shape probe text).
- errorMessage: present (string) whenever a strategy method or the classify call threw at runtime. Set on phase=error, on phase=deterministic-no-match when hasRequiredContext threw (preFilter.kind=no-required-context), and on phase=llm-* when the AI call surfaced a provider error. Examples: "strategy.detectDeterministically did not complete within 5000ms", "TypeError: Cannot read properties of undefined…".

How to read each phase:
- deterministic-no-match: the LLM never saw the row. If \`errorMessage\` is set, hasRequiredContext threw — fix that method. Otherwise the deterministic layer is the layer to fix (hasRequiredContext returning false too aggressively, or detectDeterministically returning no-match when it should have been ambiguous).
- llm-{match,no-match} with wrong verdict: the prompt or buildPrompt context is the layer to fix.
- schema-mismatch: the LLM replied but the structured-output validator rejected it. Tighten the output instructions in buildSystemPrompt or buildPrompt.
- error: a strategy method or classify call threw. Read \`errorMessage\` and address THAT specific failure (e.g. an async stall in detectDeterministically → simplify the deterministic check; a TypeError → guard the offending access). A throwing candidate is worse than a wrong one — fix runtime errors before chasing accuracy.
- candidate-rejected: the previous candidate failed to even compile/load. Read \`rejection.reason\` and address THAT specific failure (e.g. "Import 'tldts' does not resolve" → drop the offending import; "regex DoS risk: possibly-pathological regex pattern near …" → rewrite the offending regex per the catastrophic-backtracking rules in the MUST list above, do NOT just rename or reformat it; "candidate file exceeds size budget: …" → REMOVE code, do not just shorten variable names — consolidate overlapping patterns, drop deterministic rules that the LLM phase already covers, see the Size discipline section). Multiple rows will carry the same rejection reason if the candidate failed wholesale; treat them as a single signal.

When \`errorMessage\` or \`rejection\` is set, ignore predicted/expected on that row — the row's prediction is meaningless because the candidate didn't run cleanly. Treat those trajectories purely as runtime/load-failure signals.

Be SURGICAL. Strong preference for the smallest viable change:
- If the trajectories point at a single regex pattern, change ONLY that pattern. Do not refactor unrelated helpers.
- If the trajectories point at the LLM prompt, change ONLY the prompt. Leave the deterministic phase byte-for-byte identical.
- If only one tactic class is failing (e.g. persona-aim), edit only the patterns and prompt sections that target it.
- Preserve unchanged code verbatim — do not rewrite functions just for taste, naming, or formatting. Smaller diffs review faster, ship faster, and are easier to revert.
- Wholesale rewrites are acceptable ONLY when the trajectories clearly show a structural problem (e.g. the pre-filter and the prompt are both wrong on overlapping rows). State that case explicitly in the reasoning field.

Size discipline:
- The strategy file has a HARD upper bound enforced by the static scan (rejected as candidate-rejected with reason "candidate file exceeds size budget: …"). Each iteration sees only failing rows, which biases you toward addition; resist that. If the file grows on every iteration, you will eventually hit the cap and waste an iteration on a rejection.
- Before adding a pattern, regex, branch, or prompt clause: ask whether it REPLACES something existing (consolidation) or just ADDS (accretion). Strongly prefer consolidation. If you add 50 lines, try to remove 30.
- A successful iteration may produce a SMALLER file than the parent. That is a good outcome; do not pad to feel productive. Removing a regex that no longer pulls weight is just as valid as adding one that does.
- Consolidate aggressively: if two regexes capture overlapping shapes, merge them into a single alternation. If three branches differ only in a constant, table-drive them.

Layer balance (read this carefully — this is the most common bias):
- Trajectories are an ADVERSARIAL sample of the file's behavior: the orchestrator filters context to FAILURES only (rows the candidate got wrong, plus rejections). You never see the rows the candidate got right. That makes the deterministic layer look broken on every iteration even when it's working well — the regex misses are the only thing that surface.
- Resist the gradient. The deterministic layer is intentionally HIGH-PRECISION and LOW-RECALL: it exists to short-circuit obviously-malicious-or-obviously-benign rows cheaply. EVERYTHING ambiguous is supposed to fall through to the LLM phase. If the LLM is misclassifying ambiguous rows, the fix is in buildSystemPrompt / buildPrompt — NOT in piling more regex into detectDeterministically.
- Concrete heuristic: when a deterministic-no-match trajectory shows expected=true predicted=false on adversarial-but-not-obviously-malicious text, prefer LOOSENING the deterministic gate (so the row falls through to the LLM) over ADDING a new regex to catch it. Adding a regex risks false positives on benign rows you can't see; loosening the gate just shifts cost to the LLM where the model has better generalization.
- A regex pile that grows every iteration is a code smell, not a feature. If you find yourself adding regex #15 to catch a 16th tactic, the deterministic layer has outgrown its purpose — collapse it.

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
  const currentBytes = input.currentFileText.length
  const headroomBytes = input.maxBytes - currentBytes
  const baselinePct = ((currentBytes / input.baselineBytes) * 100).toFixed(0)
  const capPct = ((currentBytes / input.maxBytes) * 100).toFixed(0)
  const sections: string[] = [
    `Target: flaggers:${input.queueSlug}`,
    `Required export: ${input.exportName} (FlaggerStrategy)`,
    "",
    "Size budget:",
    `- Current file: ${currentBytes} chars (${baselinePct}% of baseline, ${capPct}% of cap).`,
    `- Baseline: ${input.baselineBytes} chars.`,
    `- Hard cap (static-scan reject above this): ${input.maxBytes} chars.`,
    `- Headroom: ${headroomBytes} chars before rejection. Aim to leave headroom, not consume it.`,
    "",
    "Current strategy file:",
    "```ts",
    input.currentFileText,
    "```",
    "",
    "Trajectories:",
    formatTrajectories(input.trajectories, input.maxTrajectories),
    "",
    "Return reasoning and a complete fileText per the schema. Remember: if the trajectories all point at the deterministic layer, consider whether the right fix is to LOOSEN it (defer to LLM) rather than to add patterns. The deterministic layer is a pre-filter, not the classifier.",
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
    // maxTokens is the *output* cap and on Anthropic it covers reasoning
    // tokens + visible answer tokens combined. budgetTokens (~8K) caps
    // thinking; the rewritten strategy file is up to ~4K tokens; the
    // visible reasoning field is a few hundred. The platform's 8192
    // default (ai-vercel/src/ai.ts) is too tight when thinking is on —
    // reasoning saturates it and the SDK throws AI_NoOutputGeneratedError
    // with no billable output. 32K leaves comfortable buffer above the
    // worst case and stays well below Opus 4.6's 64K hard cap.
    //
    // We pass `reasoningConfig` via `providerOptions.bedrock` (the
    // Bedrock-native knob from @ai-sdk/amazon-bedrock) instead of the
    // abstract top-level `reasoning` field — see the FLAGGER_PROPOSER_MODEL
    // docstring for the rationale (precise budget control + summarized
    // display). Don't set both `reasoning` and `providerOptions.bedrock.
    // reasoningConfig` — the SDK's level→budget translation can fight the
    // explicit budget and the resolution depends on SDK version.
    const result = yield* ai.generate({
      model: FLAGGER_PROPOSER_MODEL.model,
      provider: FLAGGER_PROPOSER_MODEL.provider,
      maxTokens: 16_000,
      providerOptions: {
        bedrock: {
          reasoningConfig: FLAGGER_PROPOSER_MODEL.reasoningConfig,
        },
      },
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
