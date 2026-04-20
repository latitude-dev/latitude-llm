import type { ProjectId, TraceId } from "@domain/shared"
import { Effect } from "effect"

import type { SystemQueueCacheEntry } from "./get-project-system-queues.ts"
import { materializeLiveQueueItemsUseCase } from "./materialize-live-queue-items.ts"

export const orchestrateTraceEndLiveQueueMaterializationUseCase = (input: {
  readonly traceProjectId: ProjectId
  readonly traceRowId: TraceId
  readonly traceCreatedAt: Date
  readonly selectedLiveQueueIds: readonly string[]
}) =>
  materializeLiveQueueItemsUseCase({
    projectId: input.traceProjectId,
    traceId: input.traceRowId,
    traceCreatedAt: input.traceCreatedAt,
    queueIds: input.selectedLiveQueueIds,
  })

export const orchestrateTraceEndSystemQueueWorkflowStartsUseCase =
  ({ startOnce }: { readonly startOnce: StartSystemQueueFlaggerForTraceOnce }) =>
  (input: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
    readonly selectedSystemQueues: readonly SystemQueueCacheEntry[]
  }) =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("projectId", input.projectId)
      yield* Effect.annotateCurrentSpan("traceId", input.traceId)
      yield* Effect.annotateCurrentSpan("annotationQueues.systemQueueCount", input.selectedSystemQueues.length)

      const started = yield* Effect.forEach(
        input.selectedSystemQueues,
        (queue) =>
          startOnce({
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            queueSlug: queue.queueSlug,
          }),
        { concurrency: 1 },
      )

      return { startedWorkflowCount: started.filter(Boolean).length }
    }).pipe(Effect.withSpan("annotationQueues.startTraceEndSystemQueueWorkflows"))

export type StartSystemQueueFlaggerForTraceOnce = (args: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}) => Effect.Effect<boolean, never, never>
