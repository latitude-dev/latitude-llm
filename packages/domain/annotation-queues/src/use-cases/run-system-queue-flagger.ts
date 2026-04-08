import { type NotFoundError, OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { RESOURCE_OUTLIERS_SYSTEM_QUEUE_SLUG, TOOL_CALL_ERRORS_SYSTEM_QUEUE_SLUG } from "../constants.ts"
import { matchesToolCallErrorsSystemQueue } from "../helpers.ts"

export interface RunSystemQueueFlaggerInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}

export interface RunSystemQueueFlaggerResult {
  readonly matched: boolean
}

export type RunSystemQueueFlaggerError = NotFoundError | RepositoryError

type SystemQueueFlagger = (
  input: RunSystemQueueFlaggerInput,
) => Effect.Effect<RunSystemQueueFlaggerResult, RunSystemQueueFlaggerError, TraceRepository>

const loadTraceDetail = (input: RunSystemQueueFlaggerInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository

    return yield* traceRepository.findByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.traceId),
    })
  })

const matchToolCallErrorsFlagger: SystemQueueFlagger = (input) =>
  Effect.gen(function* () {
    const trace = yield* loadTraceDetail(input)

    return {
      matched: matchesToolCallErrorsSystemQueue(trace),
    }
  })

const matchResourceOutliersFlagger: SystemQueueFlagger = (_input) => Effect.succeed({ matched: false })

const SYSTEM_QUEUE_FLAGGERS_BY_SLUG: Record<string, SystemQueueFlagger> = {
  [TOOL_CALL_ERRORS_SYSTEM_QUEUE_SLUG]: matchToolCallErrorsFlagger,
  [RESOURCE_OUTLIERS_SYSTEM_QUEUE_SLUG]: matchResourceOutliersFlagger,
}

export function getSystemQueueFlaggerBySlug(queueSlug: string): SystemQueueFlagger | undefined {
  return SYSTEM_QUEUE_FLAGGERS_BY_SLUG[queueSlug]
}

/** Runs the configured system-queue flagger for one `(queueSlug, traceId)` pair. */
export const runSystemQueueFlaggerUseCase = (input: RunSystemQueueFlaggerInput) => {
  const flagger = getSystemQueueFlaggerBySlug(input.queueSlug)

  if (!flagger) {
    return Effect.succeed({ matched: false })
  }

  return flagger(input)
}
