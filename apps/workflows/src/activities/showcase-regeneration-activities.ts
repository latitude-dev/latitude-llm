import { ShowcaseRepository, swapShowcaseUseCase } from "@domain/showcase"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { queryClickhouse } from "@platform/db-clickhouse"
import { ShowcaseRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getQueuePublisher, getRedisClient } from "../clients.ts"

const logger = createLogger("workflows-showcase-regeneration")

/**
 * Minimum distinct traces a freshly-built `next` must have before it can be
 * gated `ready` and swapped in. The seed reliably lands thousands, so this
 * floor is a wide-margin guard against a silently empty/partial ClickHouse seed
 * — not a tight quota — so it won't false-fail if seed volume changes.
 */
const SHOWCASE_MIN_TRACES = 100

class ShowcaseRegenerationActivityError extends Data.TaggedError("ShowcaseRegenerationActivityError")<{
  readonly cause: unknown
}> {
  readonly httpStatus = 500

  get httpMessage() {
    return "Showcase regeneration activity failed"
  }
}

/**
 * Thrown when the built project is too thin to promote. Non-retryable (the count
 * is deterministic — retrying won't add traces), so the workflow fails fast and
 * the swap never runs, leaving `current` untouched.
 */
class ShowcaseQualityGateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ShowcaseQualityGateError"
  }
}

/**
 * Explicit quality gate: verify the freshly-built `next` project actually has
 * telemetry (distinct traces ≥ `SHOWCASE_MIN_TRACES`) before it can be promoted.
 * A successful seed workflow means every activity returned, but this asserts the
 * *content* landed — a silently empty/partial ClickHouse seed fails here and the
 * swap never runs. Runs against the showcase org id passed in the seed input.
 */
export const assertShowcaseNextQualityActivity = async (input: {
  readonly organizationId: string
  readonly projectId: string
}): Promise<void> => {
  const traceCount = await Effect.runPromise(
    queryClickhouse<{ readonly trace_count: string }>(
      getClickhouseClient(),
      `SELECT count(DISTINCT trace_id) AS trace_count
       FROM traces
       WHERE organization_id = {organizationId:String}
         AND project_id = {projectId:String}`,
      { organizationId: input.organizationId, projectId: input.projectId },
    ).pipe(
      Effect.map((rows) => Number(rows[0]?.trace_count ?? 0)),
      withTracing,
      Effect.mapError((cause) => new ShowcaseRegenerationActivityError({ cause })),
    ),
  )

  if (traceCount < SHOWCASE_MIN_TRACES) {
    throw new ShowcaseQualityGateError(
      `Showcase build quality gate failed for project ${input.projectId}: ${traceCount} traces < ${SHOWCASE_MIN_TRACES}`,
    )
  }

  logger.info("Showcase build passed quality gate", { projectId: input.projectId, traceCount })
}

/**
 * Gate passed: flip the in-flight `next` from `building` to `ready`. If the
 * build or quality gate had failed, the workflow errors before reaching here and
 * this never runs — leaving `current` untouched.
 *
 * The showcase pointer has no RLS, so the admin client operates on the `id = 1`
 * row directly.
 */
export const markShowcaseNextReadyActivity = (): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ShowcaseRepository
      const showcase = yield* repo.markNextReady()
      logger.info("Showcase next build marked ready", {
        organizationId: showcase.organizationId,
        nextProjectId: showcase.nextProjectId,
      })
    }).pipe(
      withPostgres(ShowcaseRepositoryLive, getAdminPostgresClient()),
      withTracing,
      Effect.mapError((cause) => new ShowcaseRegenerationActivityError({ cause })),
    ),
  )

/**
 * Enqueue the S5 cleanup sweep after a swap so the just-swapped-out `current`
 * (now an orphan the pointer no longer names) is retired promptly rather than
 * waiting for the daily cleanup cron. The sweep itself runs in the workers
 * process (it needs the project/outbox layers); this only publishes the job.
 * Lives in `activities/` because the Temporal workflow sandbox forbids the
 * BullMQ publisher's I/O. `dedupeKey` collapses bursts (e.g. a manual swap
 * racing the scheduled one) into a single sweep.
 */
export const enqueueShowcaseCleanupActivity = (): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const publisher = yield* Effect.promise(() => getQueuePublisher())
      yield* publisher.publish("showcase", "cleanup", {}, { dedupeKey: "showcase:cleanup" })
      logger.info("Showcase cleanup enqueued after swap")
    }).pipe(
      withTracing,
      Effect.mapError((cause) => new ShowcaseRegenerationActivityError({ cause })),
    ),
  )

/**
 * The atomic blue/green swap: assert `next_state = 'ready'` under a row lock,
 * flip `current ← next`, reset to idle, and invalidate the Redis cache. Owned by
 * S4 (`swapShowcaseUseCase`). Idempotent-safe on retry: a replayed swap after the
 * pointer is already idle (`nextState === null`) is "already swapped" — swallowed
 * so a post-commit worker restart doesn't wedge the workflow. Any *other*
 * not-ready state (still `building`) is a real inconsistency and re-fails so the
 * workflow reports it rather than silently stopping without a swap.
 */
export const swapShowcaseActivity = (): Promise<void> =>
  Effect.runPromise(
    swapShowcaseUseCase().pipe(
      Effect.tap((showcase) =>
        Effect.sync(() =>
          logger.info("Showcase swapped", {
            organizationId: showcase.organizationId,
            currentProjectId: showcase.currentProjectId,
          }),
        ),
      ),
      Effect.asVoid,
      Effect.catchTag("ShowcaseNotReadyError", (error) =>
        error.nextState === null
          ? Effect.sync(() => logger.info("Showcase swap skipped — pointer already idle (already swapped)"))
          : Effect.fail(error),
      ),
      withPostgres(ShowcaseRepositoryLive, getAdminPostgresClient()),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
      withTracing,
      Effect.mapError((cause) => new ShowcaseRegenerationActivityError({ cause })),
    ),
  )
