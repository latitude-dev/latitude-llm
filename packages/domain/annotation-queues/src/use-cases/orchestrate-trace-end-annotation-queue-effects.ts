import type { ProjectId, TraceId } from "@domain/shared"

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
