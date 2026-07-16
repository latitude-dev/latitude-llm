import { defineSignal, patched, proxyActivities, setHandler, sleep } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type AnalyzeSessionWorkflowInput = activities.AnalyzeSessionActivityInput
export type AnalyzeSessionWorkflowResult = activities.AnalyzeSessionActivityResult

const traceCompletedSignal = defineSignal<[{ readonly debounceMs?: number }]>("traceCompleted")

const {
  checkAnalyzeSessionEligibilityActivity,
  detectAnalyzeSessionLabelsActivity,
  embedAnalyzeSessionTurnsActivity,
  hashAnalyzeSessionActivity,
  loadAnalyzeSessionActivity,
  persistAnalyzeSessionActivity,
  segmentAnalyzeSessionActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "30 seconds",
    maximumInterval: "10 minutes",
  },
})

const runAnalyzeSessionPass = async (input: AnalyzeSessionWorkflowInput): Promise<AnalyzeSessionWorkflowResult> => {
  const loaded = await loadAnalyzeSessionActivity(input)
  const hashed = await hashAnalyzeSessionActivity({ ...input, ...loaded })
  const eligibility = await checkAnalyzeSessionEligibilityActivity({ ...input, ...loaded, ...hashed })

  if (eligibility.reason === "hash_current") {
    return { action: "skipped", reason: "hash-current" }
  }

  if (!eligibility.eligible) {
    return persistAnalyzeSessionActivity(input)
  }

  if (input.reason === "backfill" || input.reason === "manual_reprocess") {
    return persistAnalyzeSessionActivity(input)
  }

  // Warm the shared message embedding store so the persist activity's full
  // use-case run resolves existing vectors and embeds only misses. Best-effort:
  // persist re-embeds misses itself, so a warm-up failure must not abort the
  // pass before persist records analysisStatus (including "failed").
  let embedded: Awaited<ReturnType<typeof embedAnalyzeSessionTurnsActivity>> = { turns: [] }
  try {
    embedded = await embedAnalyzeSessionTurnsActivity({ ...input, ...hashed })
  } catch {
    embedded = { turns: [] }
  }

  // Pre-patch executions recorded segment + label warm-up activities between
  // embed and persist. Replay that command sequence for in-flight workflows so
  // they stay deterministic across the deploy; new runs go straight to persist.
  // Remove with `deprecatePatch` once no pre-patch executions remain.
  if (!patched("analyze-session-drop-segment-label-warmup-v1")) {
    await segmentAnalyzeSessionActivity(embedded)
    await detectAnalyzeSessionLabelsActivity(embedded)
  }

  return persistAnalyzeSessionActivity(input)
}

export const analyzeSessionWorkflow = async (
  input: AnalyzeSessionWorkflowInput,
): Promise<AnalyzeSessionWorkflowResult> => {
  let rerunRequested = false

  // `session-end` uses signalWithStart so a trace completed while the stable
  // per-session workflow id is already running is delivered here instead of
  // failing as an unknown signal. Signals that arrive during an analysis pass
  // request one more deterministic pass after the current pass completes; the
  // next pass reloads the latest session state before hashing/analyzing.
  setHandler(traceCompletedSignal, () => {
    rerunRequested = true
  })

  // The settle-debounce now lives in the session-end queue job. Pre-patch executions recorded a
  // debounce timer and must replay it to stay deterministic across the deploy; new runs go straight
  // to the first pass. Remove with `deprecatePatch` once no pre-patch executions remain.
  if (!patched("analyze-session-drop-internal-debounce-v1")) {
    if (input.debounceMs !== undefined && input.debounceMs > 0) {
      await sleep(input.debounceMs)
    }
  }

  // Discard the signal the initiating signalWithStart delivers (and any that arrived during a
  // pre-patch debounce); the first pass already reflects them. Only signals during/after a pass
  // need another pass.
  rerunRequested = false

  for (;;) {
    const result = await runAnalyzeSessionPass(input)
    if (!rerunRequested) return result
    rerunRequested = false
  }
}
