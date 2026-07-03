import { EVALUATION_SCRIPT_GENERATION_SYSTEM_PROMPT, type PreviewEvaluationRow } from "@domain/evaluations"

export const SIGNAL_GENERATION_SYSTEM_PROMPT = `You design complete Latitude signals. A signal is a tracked bucket of agent sessions: it has a name, a description, an evaluation that decides per session whether the behavior is present, optional filters that pre-gate which sessions the evaluation runs on, and a sampling rate. You will be given the user's ask plus real data observed in their project; design the signal from that data, not from guesses.

## Fields

- name — at most 128 characters, recognizable in a list.
- description — one or two sentences a teammate would recognize the bucket by. When the ask was ambiguous, record the interpretation you took.
- evaluationKind + its payload — the membership detector (below).
- filters — optional pre-gate (below).
- sampling — percentage of in-scope sessions the evaluation actually runs on (below).

## Evaluation kinds — prefer rule, then judge, then script

Settings-based evaluations stay editable as forms in the builder, so prefer them:

1. rule — deterministic conditions over the session (free and instant). Use when the ask is mechanical facts: a phrase or regex in a message, empty/JSON output, output length, a metric threshold, a tool used/failed, tool-call count, an error, a finish reason. Set ruleMatch ("all" = every condition must hold, "any" = one suffices) and 1-10 ruleConditions. Metric values are in base units: duration in nanoseconds, cost in microcents, tokens/counts raw.
2. judge — an LLM reads each session and decides (costs money per run). Use for subjective or semantic behavior: tone, frustration, refusal, helpfulness. judgeCriteria is phrased as a description of the session, e.g. "A session matches when the user expresses frustration with the agent's answers."
3. script — a raw sandbox script, only when the ask genuinely mixes deterministic logic with LLM judgment (or needs logic the other two cannot express). Do not downgrade a fixable rule/judge draft to a script.

For the script kind, the sandbox contract is:

${EVALUATION_SCRIPT_GENERATION_SYSTEM_PROMPT}

## Filters — a cost pre-gate, not the detector

Correctness first: the evaluation alone must fully express the ask — a session that would match must never be lost to a filter. Filters exist only to avoid running an expensive evaluation on sessions that FOR SURE cannot match (e.g. the ask is about the checkout service and sessions are tagged by service). If no single clean dimension safely discards non-matches, set filters to null. Rules are free to run, so filters matter mostly for judge/script kinds. Use only the offered dimensions; use metadata only when the user explicitly names a key and value.

## Matching user words to observed values

You are given the values observed in the project (tags, services, models, providers, tool names). Reconcile the user's wording against them:
- The user describes something that plainly maps to an observed value ("the ticket cancellation tool" and the project has a cancel_ticket tool) — use the observed value.
- The user names something unobserved — infer the likely value from the project's naming patterns when the pattern is clear.
- The user quotes an exact literal ("the cancel_ticket tool") — use it verbatim even if unobserved; they may know data is coming.

## Sampling

- rule — always 100 (free and instant).
- judge/script — cost-aware: pick a percentage from the provided traffic so the evaluation runs on roughly a few hundred sessions per day at most; with low traffic (under ~500 sessions/day) use 100, scale down as traffic grows (e.g. ~5000/day → 10). Never below 1.

## Turn protocol

- First turn: return a complete draft with confirm=false.
- Repair turn (your previous draft failed validation or every preview run errored): fix exactly what failed and return the full corrected draft, confirm=false.
- Review turn (you are shown per-session preview verdicts of your draft): when the verdicts match the ask, return the SAME draft unchanged with confirm=true; otherwise return a revised full draft with confirm=false. A preview that matched 0 sessions means the filters discarded everything — loosen or drop them unless the ask requires that scope.`

export interface SignalGenerationGrounding {
  readonly tags: readonly string[]
  readonly serviceNames: readonly string[]
  readonly models: readonly string[]
  readonly providers: readonly string[]
  readonly tools: readonly string[]
  readonly definedTools: readonly string[]
  readonly avgSessionsPerDay: number
  readonly sampleSession: string | null
}

const list = (label: string, values: readonly string[]): string =>
  `${label}: ${values.length === 0 ? "(none observed)" : values.join(", ")}`

const groundingBlock = (grounding: SignalGenerationGrounding): string =>
  [
    "Observed project data:",
    list("- Tags", grounding.tags),
    list("- Services", grounding.serviceNames),
    list("- Models", grounding.models),
    list("- Providers", grounding.providers),
    list("- Tool names used in sessions", grounding.tools),
    list("- Tool names defined for agents", grounding.definedTools),
    `- Traffic: ~${Math.round(grounding.avgSessionsPerDay)} sessions/day over the last week`,
    ...(grounding.sampleSession === null
      ? ["- No sessions observed yet: skip filters unless the user named values, and size sampling for low traffic."]
      : ["", "A recent session, for reference:", grounding.sampleSession]),
  ].join("\n")

const VERDICT_MESSAGE_MAX = 200

export const summarizePreviewVerdicts = (rows: readonly PreviewEvaluationRow[]): string => {
  if (rows.length === 0) {
    return "The preview matched 0 sessions — the filters discarded every recent session."
  }
  const passed = rows.filter((row) => row.passed === true).length
  const errored = rows.filter((row) => row.error !== null).length
  const lines = rows.map((row) => {
    const verdict = row.error !== null ? "errored" : row.passed === true ? "matched" : "did not match"
    const about = row.summary?.firstUserMessage?.slice(0, VERDICT_MESSAGE_MAX) ?? "(no user message)"
    const detail =
      row.error !== null ? row.error.slice(0, VERDICT_MESSAGE_MAX) : row.feedback.slice(0, VERDICT_MESSAGE_MAX)
    return `- ${verdict} | session about: ${JSON.stringify(about)} | ${row.error !== null ? "error" : "feedback"}: ${JSON.stringify(detail)}`
  })
  return [`Preview over ${rows.length} recent sessions: ${passed} matched, ${errored} errored.`, ...lines].join("\n")
}

interface BuildSignalGenerationUserPromptInput {
  readonly prompt: string
  readonly grounding: SignalGenerationGrounding
  readonly scopeHint: string | null
  readonly feedback: string | null
  readonly review: string | null
}

export const buildSignalGenerationUserPrompt = (input: BuildSignalGenerationUserPromptInput): string => {
  const parts = ["Design a signal for the following request:", input.prompt, "", groundingBlock(input.grounding)]

  if (input.scopeHint !== null) {
    parts.push(
      "",
      "The user launched this from a saved search with these filters — treat them as candidate scope and apply the filters philosophy before adopting them:",
      input.scopeHint,
    )
  }

  if (input.feedback !== null) {
    parts.push("", "Your previous draft failed. Fix it and return the full corrected draft:", input.feedback)
  }

  if (input.review !== null) {
    parts.push(
      "",
      "This is a review turn. Your draft was previewed against recent sessions:",
      input.review,
      "If these verdicts match the ask, return the same draft with confirm=true; otherwise return a revised draft.",
    )
  }

  parts.push("", "Return the full draft per the schema.")
  return parts.join("\n\n")
}
