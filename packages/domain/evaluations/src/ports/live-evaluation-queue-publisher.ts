import { Context, type Effect } from "effect"
import type { LiveEvaluationQueuePublishError } from "../errors.ts"

export interface PublishLiveEvaluationExecuteInput {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly traceId: string
  readonly dedupeKey?: string
  readonly debounceMs?: number
}

export interface LiveEvaluationQueuePublisherShape {
  readonly publishExecute: (
    input: PublishLiveEvaluationExecuteInput,
  ) => Effect.Effect<void, LiveEvaluationQueuePublishError>
}

export class LiveEvaluationQueuePublisher extends Context.Service<
  LiveEvaluationQueuePublisher,
  LiveEvaluationQueuePublisherShape
>()("@domain/evaluations/LiveEvaluationQueuePublisher") {}
