import {
  type ChSqlClient,
  type FilterSet,
  OrganizationId,
  ProjectId,
  SessionId,
  type SqlClient,
  TraceDeletionRequestId,
  TraceId,
} from "@domain/shared"
import {
  finishTraceDeletionUseCase,
  prepareTraceDeletionBatchUseCase,
  purgeTraceDeletionBatchUseCase,
  purgeTraceDeletionSessionsUseCase,
  startTraceDeletionUseCase,
  TRACE_DELETION_BATCH_SIZE,
} from "@domain/spans"
import { TracePurgeRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  OutboxEventWriterLive,
  TraceDeletionRequestRepositoryLive,
  TraceReferencePurgeRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

interface TraceDeletionScope {
  readonly organizationId: string
  readonly projectId: string
  readonly traceDeletionRequestId: string
}

export interface TraceDeletionSnapshot {
  readonly finished: boolean
  readonly filters: FilterSet
  readonly createdAt: string
}

const postgresLayer = Layer.mergeAll(
  TraceDeletionRequestRepositoryLive,
  TraceReferencePurgeRepositoryLive,
  OutboxEventWriterLive,
)
const clickhouseLayer = Layer.mergeAll(TraceRepositoryLive, TracePurgeRepositoryLive)

type TraceDeletionServices =
  | Layer.Success<typeof postgresLayer>
  | Layer.Success<typeof clickhouseLayer>
  | SqlClient
  | ChSqlClient

const provide = <A, E>(organizationId: string, effect: Effect.Effect<A, E, TraceDeletionServices>) =>
  effect.pipe(
    withPostgres(postgresLayer, getPostgresClient(), OrganizationId(organizationId)),
    withClickHouse(clickhouseLayer, getClickhouseClient(), OrganizationId(organizationId)),
    withTracing,
  )

export const startTraceDeletionActivity = (input: TraceDeletionScope): Promise<TraceDeletionSnapshot> =>
  Effect.runPromise(
    provide(
      input.organizationId,
      startTraceDeletionUseCase(TraceDeletionRequestId(input.traceDeletionRequestId)).pipe(
        Effect.map((request) => ({
          finished: request.status === "completed" || request.status === "failed",
          filters: request.filters,
          createdAt: request.createdAt.toISOString(),
        })),
      ),
    ),
  )

export const prepareTraceDeletionBatchActivity = (
  input: TraceDeletionScope & { readonly snapshot: TraceDeletionSnapshot },
) =>
  Effect.runPromise(
    provide(
      input.organizationId,
      prepareTraceDeletionBatchUseCase({
        request: {
          id: TraceDeletionRequestId(input.traceDeletionRequestId),
          projectId: ProjectId(input.projectId),
          filters: input.snapshot.filters,
          createdAt: new Date(input.snapshot.createdAt),
        },
        batchSize: TRACE_DELETION_BATCH_SIZE,
      }).pipe(
        Effect.map((batch) => ({
          traceIds: batch.traceIds as readonly string[],
          sessionIds: batch.sessionIds as readonly string[],
          traceRowCounts: batch.traceRowCounts,
          sessionRowCounts: batch.sessionRowCounts,
        })),
      ),
    ),
  )

export const purgeTraceDeletionBatchActivity = (
  input: TraceDeletionScope & { readonly traceIds: readonly string[]; readonly sessionIds: readonly string[] },
) =>
  Effect.runPromise(
    provide(
      input.organizationId,
      purgeTraceDeletionBatchUseCase({
        requestId: TraceDeletionRequestId(input.traceDeletionRequestId),
        projectId: ProjectId(input.projectId),
        traceIds: input.traceIds.map(TraceId),
        sessionIds: input.sessionIds.map(SessionId),
      }),
    ),
  )

export const purgeTraceDeletionSessionsActivity = (
  input: TraceDeletionScope & { readonly sessionIds: readonly string[] },
) =>
  Effect.runPromise(
    provide(
      input.organizationId,
      purgeTraceDeletionSessionsUseCase({
        projectId: ProjectId(input.projectId),
        sessionIds: input.sessionIds.map(SessionId),
      }).pipe(Effect.asVoid),
    ),
  )

export const finishTraceDeletionActivity = (
  input: TraceDeletionScope & {
    readonly matchedTraceCount: number
    readonly deletedRowCounts: Readonly<Record<string, number>>
    readonly error?: string
  },
) =>
  Effect.runPromise(
    provide(
      input.organizationId,
      finishTraceDeletionUseCase({
        requestId: TraceDeletionRequestId(input.traceDeletionRequestId),
        matchedTraceCount: input.matchedTraceCount,
        deletedRowCounts: input.deletedRowCounts,
        error: input.error,
      }).pipe(Effect.asVoid),
    ),
  )
