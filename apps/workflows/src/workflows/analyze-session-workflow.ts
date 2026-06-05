import { proxyActivities, sleep } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type AnalyzeSessionWorkflowInput = activities.AnalyzeSessionActivityInput
export type AnalyzeSessionWorkflowResult = activities.AnalyzeSessionActivityResult

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

export const analyzeSessionWorkflow = async (
  input: AnalyzeSessionWorkflowInput,
): Promise<AnalyzeSessionWorkflowResult> => {
  if (input.debounceMs !== undefined && input.debounceMs > 0) {
    await sleep(input.debounceMs)
  }

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
