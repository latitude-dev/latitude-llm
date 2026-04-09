import type { NotFoundError, RepositoryError } from "@domain/shared"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import {
  matchesEmptyResponseSystemQueue,
  matchesForgettingSystemQueue,
  matchesFrustrationSystemQueue,
  matchesJailbreakingSystemQueue,
  matchesLazinessSystemQueue,
  matchesNsfwSystemQueue,
  matchesOutputSchemaValidationSystemQueue,
  matchesRefusalSystemQueue,
  matchesResourceOutliersSystemQueue,
  matchesToolCallErrorsSystemQueue,
  matchesTrashingSystemQueue,
} from "../helpers.ts"

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

type SystemQueueMatcher = typeof matchesEmptyResponseSystemQueue

const loadTraceDetail = (input: RunSystemQueueFlaggerInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository

    return yield* traceRepository.findByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.traceId),
    })
  })

const SYSTEM_QUEUE_MATCHERS_BY_SLUG: Record<string, SystemQueueMatcher> = {
  "empty-response": matchesEmptyResponseSystemQueue,
  "output-schema-validation": matchesOutputSchemaValidationSystemQueue,
  "tool-call-errors": matchesToolCallErrorsSystemQueue,
  jailbreaking: matchesJailbreakingSystemQueue,
  refusal: matchesRefusalSystemQueue,
  frustration: matchesFrustrationSystemQueue,
  forgetting: matchesForgettingSystemQueue,
  laziness: matchesLazinessSystemQueue,
  nsfw: matchesNsfwSystemQueue,
  trashing: matchesTrashingSystemQueue,
  "resource-outliers": matchesResourceOutliersSystemQueue,
}

export function getSystemQueueMatcherBySlug(queueSlug: string): SystemQueueMatcher | undefined {
  return SYSTEM_QUEUE_MATCHERS_BY_SLUG[queueSlug]
}

export const runSystemQueueFlaggerUseCase = (input: RunSystemQueueFlaggerInput) =>
  Effect.gen(function* () {
    const matcher = getSystemQueueMatcherBySlug(input.queueSlug)

    if (!matcher) return { matched: false }

    const trace = yield* loadTraceDetail(input)

    return {
      matched: matcher(trace),
    }
  })
