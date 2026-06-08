import { defineSignal, proxyActivities, setHandler, sleep } from "@temporalio/workflow"
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

  // Warm-up stages pre-fill the Redis embedding cache so the persist
  // activity's full use-case run hits warm keys. Projection/assignment are
  // NOT warmed: the persisted projection embeds the moment text, which these
  // stages cannot reproduce from turn vectors — warming a different vector
  // is pure waste (verified in review).
  const embedded = await embedAnalyzeSessionTurnsActivity(hashed)
  const segmented = await segmentAnalyzeSessionActivity(embedded)
  await detectAnalyzeSessionLabelsActivity({ ...embedded, ...segmented })
  return persistAnalyzeSessionActivity(input)
}

export const analyzeSessionWorkflow = async (
  input: AnalyzeSessionWorkflowInput,
): Promise<AnalyzeSessionWorkflowResult> => {
  let rerunRequested = false

  // `trace-end` uses signalWithStart so a trace completed while the stable
  // per-session workflow id is already running is delivered here instead of
  // failing as an unknown signal. Signals that arrive during an analysis pass
  // request one more deterministic pass after the current pass completes; the
  // next pass reloads the latest session state before hashing/analyzing.
  setHandler(traceCompletedSignal, () => {
    rerunRequested = true
  })

  if (input.debounceMs !== undefined && input.debounceMs > 0) {
    await sleep(input.debounceMs)
  }

  // Signals received during the initial debounce are already covered by the
  // first load after the debounce. Only signals received during/after a pass
  // need another pass.
  rerunRequested = false

  for (;;) {
    const result = await runAnalyzeSessionPass(input)
    if (!rerunRequested) return result
    rerunRequested = false
  }
}
