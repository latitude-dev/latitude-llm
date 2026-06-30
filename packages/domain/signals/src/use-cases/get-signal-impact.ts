import { ScoreAnalyticsRepository } from "@domain/scores"
import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, SignalId } from "@domain/shared"
import { SessionRepository, TraceRepository } from "@domain/spans"
import { Effect } from "effect"

export interface GetSignalImpactInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
}

/**
 * Lifetime impact rollup for one issue: raw counts (`scores`), the project-wide
 * denominators, and the two affected-share fractions. Sessions are the
 * product's primary unit, so `affectedSessionsPercent` is the headline metric;
 * `affectedTracesPercent` is the trace-level baseline the Patterns view compares
 * against. Both fractions are clamped to `[0, 1]`.
 */
export interface SignalImpact {
  readonly occurrences: number
  readonly affectedTraces: number
  readonly affectedSessions: number
  readonly affectedUsers: number
  readonly costMicrocents: number
  readonly tokens: number
  readonly totalProjectTraces: number
  readonly affectedTracesPercent: number
  readonly totalProjectSessions: number
  readonly affectedSessionsPercent: number
}

export type GetSignalImpactError = RepositoryError

export const getSignalImpactUseCase = (
  input: GetSignalImpactInput,
): Effect.Effect<
  SignalImpact,
  GetSignalImpactError,
  ChSqlClient | ScoreAnalyticsRepository | TraceRepository | SessionRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("signalId", String(input.signalId))

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const traceRepository = yield* TraceRepository
    const sessionRepository = yield* SessionRepository

    const [impact, totalProjectTraces, projectSessions] = yield* Effect.all([
      scoreAnalyticsRepository.aggregateImpactBySignal({
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalId: input.signalId,
      }),
      traceRepository.countByProjectId({ organizationId: input.organizationId, projectId: input.projectId }),
      sessionRepository.countByProjectId({ organizationId: input.organizationId, projectId: input.projectId }),
    ])

    const totalProjectSessions = projectSessions.totalCount

    return {
      occurrences: impact.occurrences,
      affectedTraces: impact.affectedTraces,
      affectedSessions: impact.affectedSessions,
      affectedUsers: impact.affectedUsers,
      costMicrocents: impact.costMicrocents,
      tokens: impact.tokens,
      totalProjectTraces,
      affectedTracesPercent: totalProjectTraces === 0 ? 0 : Math.min(impact.affectedTraces / totalProjectTraces, 1),
      totalProjectSessions,
      affectedSessionsPercent:
        totalProjectSessions === 0 ? 0 : Math.min(impact.affectedSessions / totalProjectSessions, 1),
    } satisfies SignalImpact
  }).pipe(Effect.withSpan("issues.getSignalImpact"))
