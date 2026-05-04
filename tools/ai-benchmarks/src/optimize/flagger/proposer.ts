import { AI, type GenerateInput } from "@domain/ai"
import {
  hashOptimizationCandidateText,
  type OptimizationCandidate,
  type OptimizationTrajectory,
} from "@domain/optimizations"
import { type Cause, Data, Effect } from "effect"
import { z } from "zod"
import { computeCost } from "../../runner/pricing.ts"
import { applyEdits, type FindReplaceEdit } from "./apply-edits.ts"

export type ProposerProvider = "amazon-bedrock" | "anthropic"

export const DEFAULT_PROPOSER_PROVIDER: ProposerProvider = "amazon-bedrock"

export const DEFAULT_PROPOSER_MODELS: Record<ProposerProvider, string> = {
  "amazon-bedrock": "anthropic.claude-opus-4-6-v1",
  anthropic: "claude-opus-4-6",
}

const REASONING_BUDGET_TOKENS = 4096

export interface FlaggerProposerModel {
  readonly provider: ProposerProvider
  readonly model: string
}

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
      "Concrete rationale: which trajectories drove which edits, what gap each edit addresses. Surface 'I would have used X' suggestions here for the human reviewer. Keep it to 100–300 words — this is for human reviewers at adoption time, not internal deliberation (the thinking channel handles that).",
    ),
  edits: z
    .array(
      z.object({
        find: z
          .string()
          .min(20)
          .describe(
            "Substring of the CURRENT strategy file to replace. MUST occur exactly once in the file (or in the file produced by previous edits in this list, if any). Include 1–2 lines of surrounding context above and below the change to make the match unambiguous. Whitespace and indentation must match byte-for-byte.",
          ),
        replace: z
          .string()
          .describe(
            "Text that replaces `find`. Use empty string to delete. Use the same surrounding context as `find` plus the new lines you want to add — do NOT emit a unified-diff `+`/`-` format, just the literal replacement text.",
          ),
      }),
    )
    .min(1)
    .describe(
      "Ordered list of literal find/replace edits applied SEQUENTIALLY against the current strategy file. Each edit operates on the result of the previous one. The applier rejects the candidate if any `find` matches zero or multiple times — pick anchors with enough context to be unique.",
    ),
})
type FlaggerProposerOutput = z.infer<typeof flaggerProposerOutputSchema>

type ThinkingConfig = Pick<GenerateInput<FlaggerProposerOutput>, "reasoning" | "providerOptions">
/**
 * Provider-specific thinking/reasoning options. Bedrock and direct Anthropic
 * expose the same Anthropic feature under different shapes; this resolver
 * picks the right one. Bedrock additionally supports `display: "summarized"`,
 * which direct Anthropic doesn't.
 */
const resolveThinking = (model: FlaggerProposerModel): ThinkingConfig => {
  if (model.provider === "amazon-bedrock") {
    return {
      providerOptions: {
        bedrock: {
          reasoningConfig: {
            type: "enabled",
            budgetTokens: REASONING_BUDGET_TOKENS,
            display: "summarized",
          },
        },
      },
    }
  }

  return { reasoning: "medium" }
}

/**
 * Tagged error for the candidate-text hashing step. Distinct from AI
 * errors so the Effect chain preserves type-level distinction even if
 * we ever consumed errors directly instead of via the catch-all
 * `catchCause` at the bottom of `callFlaggerProposer`.
 */
class FlaggerProposerHashError extends Data.TaggedError("FlaggerProposerHashError")<{
  readonly cause: unknown
}> {}

/**
 * Tagged error raised when the model returned a syntactically valid edits
 * list but at least one find/replace failed to apply (zero or 2+ matches).
 * Distinct from AI / hashing errors so the orchestrator can classify the
 * rejection stage as `patch-apply` in the audit trail and surface a more
 * actionable message to the next propose call's trajectories.
 *
 * `cause` is widened to `unknown` so the `Effect.try` `catch` can return
 * a single typed error regardless of what `applyEdits` threw — in practice
 * always an `ApplyEditsError`, but a defensive wrap keeps the Effect
 * error channel typed without a second tagged error class for the
 * "shouldn't-happen" branch.
 */
class FlaggerProposerApplyError extends Data.TaggedError("FlaggerProposerApplyError")<{
  readonly cause: unknown
}> {}

type ProposerPhase = "preparing" | "calling" | "received" | "hashing"

interface FlaggerProposerInput {
  readonly currentFileText: string
  readonly currentCandidate: OptimizationCandidate
  readonly trajectories: readonly OptimizationTrajectory[]
  readonly operatorNotes: string | null
  readonly flaggerSlug: string
  readonly exportName: string
  readonly maxTrajectories: number
  readonly proposerModel: FlaggerProposerModel
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
  /**
   * The literal find/replace edits the model returned. Empty on the
   * error sentinel (AI / patch-apply / hashing failures), populated on
   * success. Surfaced so the orchestrator can render a digestible
   * per-edit summary in the debug log instead of dumping the full
   * post-edit file text on every iteration.
   */
  readonly edits: readonly FindReplaceEdit[]
  readonly costUsd: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly reasoningTokens: number
}

const buildSystemPrompt = (input: { readonly flaggerSlug: string; readonly exportName: string }): string =>
  `# Role

You optimize a Latitude flagger strategy file used in production trace classification.

# Inputs

- The full TypeScript source of the current strategy file.
- A JSON-encoded set of evaluation trajectories (per-row expected/predicted verdicts, deterministic-phase signals, LLM verdict if reached).

# Output

Return reasoning and an ORDERED list of literal find/replace edits per the output schema. Edits apply SEQUENTIALLY: edit 2 operates on the file produced by edit 1, etc. Each \`find\` is a verbatim substring of the (possibly already-edited) file; \`replace\` is the literal text that takes its place. Empty \`replace\` deletes.

## Edit rules — failure here wastes an entire iteration

- \`find\` MUST match exactly once. Zero matches → "match-not-found" rejection; multiple → "ambiguous-match". Both surface in next round's trajectories under \`phase: "candidate-rejected"\`.
- Include 1–2 lines of context above and below the change so \`find\` is unique. The changed line alone almost always matches multiple places.
- Whitespace and indentation must match the source byte-for-byte — copy, don't paraphrase.
- No unified-diff \`+\`/\`-\` markers. \`replace\` is the literal text that should appear after the edit, including the context lines from \`find\`.
- Prefer many small edits over one big edit (easier to disambiguate, cheaper to generate).
- Pure additions: use a small \`find\` for the line above the insertion point and put that line plus the new content in \`replace\`.

## Example edit (illustrative format — not necessarily applicable)

{
  "find": "  // Block obvious AIM persona attacks\n  if (text.match(/\\\\bact as AIM\\\\b/i)) return { kind: \\"matched\\" }",
  "replace": "  // Block AIM and Machiavelli persona-roleplay attacks\n  if (text.match(/\\\\b(act as|pretend to be) (AIM|Machiavelli)\\\\b/i)) return { kind: \\"matched\\" }"
}

# Hard constraint: no catastrophic-backtracking regex

The single biggest production risk in this file. The static scan auto-rejects nested unbounded quantifiers — any \`*\` or \`+\` group whose body contains another unbounded quantifier on overlapping characters. Forbidden examples: \`(a+)+\`, \`(.*)*\`, \`(.+)*\`, \`(\\w+)+\`, \`(\\S*)*\`, \`(\\d*)*\`, \`(.|\\s)*\`.

These hang Node's regex engine on adversarial input — the per-method 5s timeout cannot interrupt sync regex hangs, so one bad pattern freezes the whole run.

If you need repeated matching:
- Use a single quantifier on a non-overlapping class (\`[a-z]+\` not \`(\\w+)+\`).
- Bound the inner repetition (\`\\w{1,32}\` not \`\\w+\`).
- Split into multiple anchored passes.

Trace text is adversarial — assume any pattern that CAN be exploited WILL be.

# Other constraints on the resulting file

- Export "${input.exportName}: FlaggerStrategy" with four methods: \`hasRequiredContext\`, \`detectDeterministically\`, \`buildSystemPrompt\`, \`buildPrompt\`.
- Compiles as valid TypeScript. No markdown fences.
- Imports limited to modules already declared in the strategy package's \`package.json\` (workspace \`@domain/*\`, \`@repo/*\`, plus existing npm deps). Relative imports stay inside the \`flagger-strategies\` directory.
- No \`process.*\`, \`globalThis\` writes, \`eval\`, \`Function\` constructor, dynamic \`import()\`, \`require()\`, \`child_process\`, \`fs\`, \`net\`, \`vm\`, or any \`node:*\` builtin.
- Conforms to the \`FlaggerStrategy\` interface contract.

# Free to change

Restructure helpers, rename internal functions, replace regex with a different deterministic check, rewrite the system prompt, change the suspicious-snippet extractor — as long as the four exported methods remain. Surface "I would have used X (would need a new dep)" notes in \`reasoning\` so the reviewer can decide whether to install before re-running.

# Optimization objective

Optimize for **F1 at the lowest per-trace cost**. Every fall-through to the LLM is real money on every production trace — the deterministic layer is essentially free, the LLM is not. Prefer the candidate that hits the same F1 with fewer LLM calls.

If you're trading precision for recall, F1 for cost, or vice versa, say so explicitly in \`reasoning\` so the reviewer can sanity-check the trade-off.

# Trajectory schema

Each trajectory's \`feedback\` is JSON with:
- \`expected\`, \`predicted\` (booleans)
- \`phase\`: \`deterministic-{match,no-match}\`, \`llm-{match,no-match}\`, \`schema-mismatch\`, \`error\`, or \`candidate-rejected\`
- \`tags\` (e.g. tactic labels)
- \`preFilter\`: \`{ kind: "matched" | "no-match" | "ambiguous" | "no-required-context" | "no-detect-method", feedback? }\` — what the deterministic layer returned. \`no-required-context\` = \`hasRequiredContext\` returned false or threw; \`no-detect-method\` = \`detectDeterministically\` threw; \`ambiguous\` = deferred to LLM.
- \`llmVerdict\`: non-null only on \`llm-*\` phases
- \`rejection\`: \`{ stage, reason }\`, present only on \`candidate-rejected\`. \`stage\` ∈ {\`static-scan\`, \`compile\`, \`import\`, \`shape\`, \`patch-apply\`}.
- \`errorMessage\`: when a strategy method or the classify call threw. Set on \`phase=error\`, on \`deterministic-no-match\` when \`hasRequiredContext\` threw, and on \`llm-*\` when the AI call surfaced a provider error.

When \`errorMessage\` or \`rejection\` is set, ignore \`predicted\`/\`expected\` on that row — the candidate didn't run cleanly, so per-row predictions are meaningless. Treat as load-failure signals.

# Reading the phases — which layer to fix

- \`deterministic-no-match\`: LLM never saw the row. If \`errorMessage\` is set, fix \`hasRequiredContext\`. Otherwise the deterministic layer is too aggressive — usually means \`detectDeterministically\` returned \`no-match\` where it should have returned \`ambiguous\`.
- \`llm-{match,no-match}\` with wrong verdict: fix \`buildSystemPrompt\` or \`buildPrompt\`.
- \`schema-mismatch\`: LLM replied but output didn't validate. Tighten the output instructions in the prompt.
- \`error\`: a method threw. Read \`errorMessage\` and fix THAT specific failure. A throwing candidate is worse than a wrong one — fix runtime errors before chasing accuracy.
- \`candidate-rejected\`: previous candidate failed to compile/load. Read \`rejection.reason\` and address THAT failure (e.g. \`Import 'tldts' does not resolve\` → drop the import; \`regex DoS risk\` → rewrite per the catastrophic-backtracking rules above; \`candidate file exceeds size budget\` → REMOVE code, don't shorten variable names; \`patch-apply\` → your previous edit's \`find\` was non-unique, add more context). Many rows usually carry the same reason for a wholesale failure — treat as a single signal.

# Change discipline

- Smallest viable change. If trajectories point at one regex, edit ONLY that regex. If they point at the LLM prompt, edit ONLY the prompt. If only one tactic class is failing, touch only the patterns and prompt sections targeting it.
- Preserve unchanged code verbatim. Don't rewrite functions for taste, naming, or formatting — smaller diffs review faster, ship faster, revert easier.
- Wholesale rewrites are acceptable ONLY when trajectories clearly show a structural problem (e.g. pre-filter and prompt both wrong on overlapping rows). State that case explicitly in \`reasoning\`.
- Consolidate, don't accrete. Each iteration sees only failing rows, biasing toward addition. Resist. Before adding a regex/branch/clause, ask: does this REPLACE something or just ADD? Strong preference for replace. If you add 50 lines, try to remove 30. Two regexes capturing overlapping shapes → merge into one alternation. Three branches differing only in a constant → table-drive.
- A successful iteration may produce a SMALLER file. That's a good outcome — don't pad to feel productive. Removing a regex that no longer pulls weight is just as valid as adding one that does.

# Layer balance (the most common bias — read carefully)

- Trajectories are an ADVERSARIAL sample: the orchestrator filters to FAILURES only. You never see the rows the candidate got right. That makes the deterministic layer look broken every iteration even when it's working well — the regex misses are the only thing that surface.
- Resist the gradient. The deterministic layer is intentionally HIGH-PRECISION and LOW-RECALL — its job is to short-circuit obvious cases cheaply. Truly ambiguous rows fall through to the LLM; if the LLM then misclassifies them, the fix is in \`buildSystemPrompt\`/\`buildPrompt\`, not in piling more regex into \`detectDeterministically\`.
- Cost asymmetry: deterministic checks are essentially free; every LLM call costs real money on every production trace. "Just defer to the LLM" is NOT a free move. A tight deterministic gate that short-circuits clear-cut cases — both clearly malicious AND clearly benign — beats a loose gate that punts everything to the LLM.
- When a \`deterministic-no-match\` shows \`expected=true predicted=false\` on adversarial-but-not-obviously-malicious text, weigh both fixes honestly. Adding a regex risks false positives on benign rows you can't see; loosening the gate shifts cost to the LLM on every future trace that matches the loosened pattern. Neither is automatically correct — pick based on which is the genuine generalization.
- A regex pile that grows every iteration without consolidation is a code smell — merge overlapping patterns. But a well-targeted regex that cheaply short-circuits a common shape is a cost win, not a smell.`

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
    `Target: flaggers:${input.flaggerSlug}`,
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
    "Return reasoning and an ordered list of find/replace edits per the schema. Each edit operates on the result of the previous one. Remember: if the trajectories all point at the deterministic layer, consider whether the right fix is to LOOSEN it (defer to LLM) rather than to add patterns. The deterministic layer is a pre-filter, not the classifier.",
  ]

  return sections.join("\n")
}

export const callFlaggerProposer = (input: FlaggerProposerInput): Effect.Effect<FlaggerProposerResult, never, AI> =>
  Effect.gen(function* () {
    const ai = yield* AI
    input.onPhase?.("preparing")
    const systemPrompt = buildSystemPrompt({
      flaggerSlug: input.flaggerSlug,
      exportName: input.exportName,
    })
    const operatorNotes = buildOperatorNotesSection(input.operatorNotes)
    const userPrompt = buildUserPrompt(input)

    input.onPhase?.("calling")

    const result = yield* ai.generate({
      model: input.proposerModel.model,
      provider: input.proposerModel.provider,
      system: `${systemPrompt}${operatorNotes}`,
      prompt: userPrompt,
      schema: flaggerProposerOutputSchema,
      maxTokens: 16_000,
      ...resolveThinking(input.proposerModel),
    })
    input.onPhase?.("received")

    const usage = result.tokenUsage ?? { input: 0, output: 0 }
    const cost = computeCost(input.proposerModel.provider, input.proposerModel.model, {
      input: usage.input ?? 0,
      output: usage.output ?? 0,
      reasoning: usage.reasoning ?? 0,
      cacheRead: usage.cacheRead ?? 0,
      cacheWrite: usage.cacheWrite ?? 0,
      attempts: 1,
      successes: 1,
    })

    const fileText = yield* Effect.try({
      try: () => applyEdits(input.currentFileText, result.object.edits),
      catch: (cause: unknown) => new FlaggerProposerApplyError({ cause }),
    })
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
      edits: result.object.edits,
      costUsd: typeof cost.totalUsd === "number" ? cost.totalUsd : 0,
      inputTokens: usage.input ?? 0,
      outputTokens: usage.output ?? 0,
      reasoningTokens: usage.reasoning ?? 0,
    } satisfies FlaggerProposerResult
  }).pipe(
    Effect.catchCause((cause: Cause.Cause<unknown>) =>
      Effect.sync(() => {
        // The propose path swallows AI / hashing / patch-apply errors and
        // surfaces them as a sentinel result (empty fileText + reasoning
        // carrying the cause) so the orchestrator can detect the failure
        // and feed it back to the next proposer attempt.
        //
        // Two prefix kinds the orchestrator pattern-matches on:
        //   [patch-apply-error] — the model returned an edits list but at
        //     least one find/replace failed to apply uniquely. Maps to
        //     rejection.stage = "patch-apply" in the audit so the next
        //     propose sees the failure in candidate-rejected trajectory
        //     feedback and can pick better anchors next time.
        //   [proposer-error] — anything else (Anthropic API failure, schema
        //     validation, hashing). Maps to rejection.stage = "proposer-error".
        //
        // We pattern-match on the stringified cause rather than walking
        // Effect's Cause structure: the tagged error's class name is
        // preserved through `String(cause)` for both Fail and Die cases,
        // and it's resilient to future Effect version changes that
        // reshape the Cause iterator API.
        const causeStr = String(cause)
        const isApplyError = causeStr.includes("FlaggerProposerApplyError")
        const reason = causeStr.slice(0, 500)
        const prefix = isApplyError ? "[patch-apply-error]" : "[proposer-error]"
        return {
          candidate: {
            componentId: input.currentCandidate.componentId,
            text: "",
            hash: "",
          },
          reasoning: `${prefix} ${reason}`,
          edits: [],
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
        } satisfies FlaggerProposerResult
      }),
    ),
  )
