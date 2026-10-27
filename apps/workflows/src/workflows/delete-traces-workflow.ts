import { ApplicationFailure, continueAsNew, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type DeleteTracesWorkflowInput = {
  readonly organizationId: string
  readonly projectId: string
  readonly traceDeletionRequestId: string
  readonly progress?: {
    readonly matchedTraceCount: number
    readonly deletedRowCounts: Readonly<Record<string, number>>
  }
}

// Bounds workflow history: each batch adds three activities, so a run rolls over well before history limits.
const BATCHES_PER_RUN = 40

const {
  startTraceDeletionActivity,
  prepareTraceDeletionBatchActivity,
  purgeTraceDeletionBatchActivity,
  purgeTraceDeletionSessionsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    nonRetryableErrorTypes: [...(defaultActivityRetryPolicy.nonRetryableErrorTypes ?? []), "NotFoundError"],
  },
})

const { finishTraceDeletionActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: defaultActivityRetryPolicy,
})

const addCounts = (total: Record<string, number>, counts: Readonly<Record<string, number>>) => {
  for (const [key, rows] of Object.entries(counts)) total[key] = (total[key] ?? 0) + rows
}

const describeFailure = (error: unknown): string => {
  const cause = error instanceof Error && "cause" in error ? error.cause : undefined
  if (cause instanceof Error && cause.message) return cause.message
  return error instanceof Error && error.message ? error.message : "Trace deletion failed"
}

export const deleteTracesWorkflow = async (input: DeleteTracesWorkflowInput): Promise<void> => {
  const scope = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    traceDeletionRequestId: input.traceDeletionRequestId,
  }
  const snapshot = await startTraceDeletionActivity(scope)
  if (snapshot.finished) return

  let matchedTraceCount = input.progress?.matchedTraceCount ?? 0
  const deletedRowCounts: Record<string, number> = { ...(input.progress?.deletedRowCounts ?? {}) }
  let previousBatch = new Set<string>()

  try {
    for (let batch = 0; batch < BATCHES_PER_RUN; batch++) {
      const prepared = await prepareTraceDeletionBatchActivity({ ...scope, snapshot })
      if (prepared.traceIds.length === 0) {
        await finishTraceDeletionActivity({ ...scope, matchedTraceCount, deletedRowCounts })
        return
      }
      // A purged trace never lists again, so seeing one twice means the deletes did not take.
      if (prepared.traceIds.some((traceId) => previousBatch.has(traceId))) {
        throw ApplicationFailure.nonRetryable("Matched traces could not be deleted", "TraceDeletionStalled")
      }

      await purgeTraceDeletionBatchActivity({
        ...scope,
        traceIds: prepared.traceIds,
        sessionIds: prepared.sessionIds,
        includeDatasetRows: snapshot.includeDatasetRows === true,
      })
      matchedTraceCount += prepared.traceIds.length
      addCounts(deletedRowCounts, prepared.traceRowCounts)
      await purgeTraceDeletionSessionsActivity({ ...scope, sessionIds: prepared.sessionIds })
      addCounts(deletedRowCounts, prepared.sessionRowCounts)
      previousBatch = new Set(prepared.traceIds)
    }
  } catch (error) {
    await finishTraceDeletionActivity({ ...scope, matchedTraceCount, deletedRowCounts, error: describeFailure(error) })
    throw ApplicationFailure.nonRetryable(describeFailure(error), "TraceDeletionFailed")
  }

  await continueAsNew<typeof deleteTracesWorkflow>({ ...input, progress: { matchedTraceCount, deletedRowCounts } })
}
