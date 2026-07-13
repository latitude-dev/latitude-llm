import {
  createShowcaseUseCase,
  type Showcase,
  ShowcaseNotFoundError,
  ShowcaseRepository,
  swapShowcaseUseCase,
} from "@domain/showcase"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  OrganizationRepositoryLive,
  type PostgresClient,
  ShowcaseRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"

/**
 * The showcase pointer as the backoffice renders it. `null`-heavy because a
 * freshly-created showcase has no project yet (`currentProjectId = null`) and no
 * build in flight (`nextProjectId = null`, `nextState = null`).
 */
export interface AdminShowcaseStateDto {
  organizationId: string
  currentProjectId: string | null
  nextProjectId: string | null
  nextState: "building" | "ready" | null
  createdAt: string
  updatedAt: string
}

/** Exported for the DTO-mapping test. */
export const toShowcaseDto = (showcase: Showcase): AdminShowcaseStateDto => ({
  organizationId: showcase.organizationId,
  currentProjectId: showcase.currentProjectId,
  nextProjectId: showcase.nextProjectId,
  nextState: showcase.nextState,
  createdAt: showcase.createdAt.toISOString(),
  updatedAt: showcase.updatedAt.toISOString(),
})

/**
 * Read the singleton pointer on the admin client. No org scope: the pointer
 * table has no RLS (system/config), so a plain read resolves it directly — the
 * same access the worker uses.
 */
const findShowcase = (client: PostgresClient) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ShowcaseRepository
      return yield* repo.find()
    }).pipe(withPostgres(ShowcaseRepositoryLive, client), withTracing),
  )

/**
 * Backoffice showcase-pointer fetch. Returns `null` when no showcase has been
 * created yet — the UI then offers the guarded Create action.
 *
 * Guard: {@link adminMiddleware}. Postgres runs on {@link getAdminPostgresClient}
 * at the default `"system"` scope (RLS bypass) — the pointer table is unscoped.
 */
export const adminGetShowcase = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<AdminShowcaseStateDto | null> => {
    const showcase = await findShowcase(getAdminPostgresClient())
    return showcase ? toShowcaseDto(showcase) : null
  })

/**
 * Create the showcase: its dedicated org + the singleton pointer row.
 *
 * Fails loudly if a showcase already exists — the use-case's explicit up-front
 * check surfaces a clean `ShowcaseAlreadyExistsError` (the `id = 1` PK guard is
 * the race-proof backstop). The UI only shows this action when none exists, so
 * a duplicate here means a concurrent create; the error reaches the toast.
 */
export const adminCreateShowcase = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<AdminShowcaseStateDto> => {
    const client = getAdminPostgresClient()

    const showcase = await Effect.runPromise(
      createShowcaseUseCase().pipe(
        withPostgres(Layer.merge(ShowcaseRepositoryLive, OrganizationRepositoryLive), client),
        withTracing,
      ),
    )

    return toShowcaseDto(showcase)
  })

/**
 * Manually trigger a regeneration. Publishes the same `showcase/regenerate`
 * job the daily cron fires — the worker owns the begin → build → gate → swap
 * cycle, so this is purely the on-demand trigger. Guards that a showcase exists
 * first so the operator gets a clean error rather than a silent worker no-op.
 */
export const adminRegenerateShowcase = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<void> => {
    const showcase = await findShowcase(getAdminPostgresClient())
    if (!showcase) throw new ShowcaseNotFoundError()

    const publisher = await getQueuePublisher()
    await Effect.runPromise(publisher.publish("showcase", "regenerate", {}).pipe(withTracing))
  })

/**
 * Reclaim a wedged build: publish the `showcase/cleanup` self-heal job,
 * which resets a `building` pointer whose regeneration run has died and retires
 * orphaned projects. Idempotent — a healthy in-flight build is left untouched.
 *
 * Deliberately does NOT also publish `regenerate`: both would land on the same
 * queue and BullMQ runs them concurrently (no per-queue serialization), so a
 * regeneration could resume the wedged `next` before cleanup reclaims it,
 * defeating the recovery. After cleanup lands (pointer → idle) the operator
 * triggers a fresh build with Regenerate.
 */
export const adminReclaimShowcase = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<void> => {
    const showcase = await findShowcase(getAdminPostgresClient())
    if (!showcase) throw new ShowcaseNotFoundError()

    const publisher = await getQueuePublisher()
    await Effect.runPromise(publisher.publish("showcase", "cleanup", {}).pipe(withTracing))
  })

/**
 * Manually perform the blue/green swap: the transactional pointer flip
 * (`current ← next`) plus Redis invalidation. Enabled in the UI only when
 * `nextState = ready`; the use-case is the authority — a not-ready swap fails
 * `ShowcaseNotReadyError`, which is also the race guard against a concurrent
 * scheduled swap.
 */
export const adminSwapShowcase = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async (): Promise<AdminShowcaseStateDto> => {
    const client = getAdminPostgresClient()

    const swapped = await Effect.runPromise(
      swapShowcaseUseCase().pipe(
        withPostgres(ShowcaseRepositoryLive, client),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )

    return toShowcaseDto(swapped)
  })
