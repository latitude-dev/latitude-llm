import { OrganizationRepository } from "@domain/organizations"
import {
  CacheStore,
  NotFoundError,
  type OrganizationId,
  organizationIdSchema,
  type ProjectId,
  projectIdSchema,
  type RepositoryError,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { ShowcaseRepository } from "../ports/showcase-repository.ts"

/**
 * Redis key for the resolved showcase pointer. It names the one live showcase
 * org+project, so it is global (not org-scoped) and carries no `org:` prefix;
 * the `latitude:` namespace is applied by the Redis client. The pointer table
 * is the source of truth and invalidates this key when it changes.
 */
export const SHOWCASE_POINTER_CACHE_KEY = "showcase:current"

const SHOWCASE_POINTER_CACHE_TTL_SECONDS = 300

/**
 * The single value the resolver hands to callers. Its `organizationId` MUST be
 * passed identically to both `withPostgres`/`withClickHouse` and the repo method
 * arg: ClickHouse has no RLS backstop, so the layer org and the query-param org
 * must be the same resolved value or a mismatch reads the wrong tenant.
 */
export interface ResolvedShowcase {
  readonly organizationId: OrganizationId
  readonly currentProjectId: ProjectId
}

const resolvedShowcaseSchema = z.object({
  organizationId: organizationIdSchema,
  currentProjectId: projectIdSchema,
})

const parseCachedPointer = (json: string): ResolvedShowcase | null => {
  try {
    const result = resolvedShowcaseSchema.safeParse(JSON.parse(json))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * Reads the pinned showcase org+current-project from the pointer, Redis-cached.
 * Returns `null` when no showcase exists yet or no project has been built
 * (`currentProjectId` null) — the caller turns that into a 404. Cache errors
 * degrade to the DB read; only live resolutions are cached (never the null).
 */
const resolveShowcasePointer = Effect.fn("showcase.resolvePointer")(function* () {
  const cache = yield* CacheStore

  const cachedJson = yield* cache
    .get(SHOWCASE_POINTER_CACHE_KEY)
    .pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
  if (cachedJson !== null) {
    const parsed = parseCachedPointer(cachedJson)
    if (parsed !== null) {
      yield* Effect.annotateCurrentSpan("cache.hit", true)
      return parsed
    }
  }
  yield* Effect.annotateCurrentSpan("cache.hit", false)

  const showcaseRepo = yield* ShowcaseRepository
  const pointer = yield* showcaseRepo.find()
  if (!pointer || pointer.currentProjectId === null) {
    return null
  }

  const resolved: ResolvedShowcase = {
    organizationId: pointer.organizationId,
    currentProjectId: pointer.currentProjectId,
  }
  yield* cache
    .set(SHOWCASE_POINTER_CACHE_KEY, JSON.stringify(resolved), { ttlSeconds: SHOWCASE_POINTER_CACHE_TTL_SECONDS })
    .pipe(Effect.catchTag("CacheError", () => Effect.void))
  return resolved
})

export interface ResolveShowcaseInput {
  readonly requestingOrganizationId: OrganizationId
}

export type ResolveShowcaseError = NotFoundError | RepositoryError

/**
 * The showcase read chokepoint. Authorizes "authenticated AND the requesting
 * org's `wantsShowcase` flag is true" — else a plain 404 — then resolves the
 * pinned showcase org+project from the pointer. Returns exactly one org id for
 * the caller to thread into every layer (Postgres, ClickHouse, and the repo
 * arg), which is what keeps the RLS-less ClickHouse read scoped correctly.
 *
 * A missing requesting org and a false/absent flag are indistinguishable from
 * "no showcase" to the caller — all three are the same 404, so a dismissed org
 * leaks nothing about whether a showcase exists.
 */
export const resolveShowcaseUseCase = Effect.fn("showcase.resolve")(function* (input: ResolveShowcaseInput) {
  const organizationRepo = yield* OrganizationRepository
  const requestingOrg = yield* organizationRepo
    .findById(input.requestingOrganizationId)
    .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

  if (requestingOrg?.settings?.wantsShowcase !== true) {
    return yield* Effect.fail(new NotFoundError({ entity: "Showcase", id: input.requestingOrganizationId }))
  }

  const resolved = yield* resolveShowcasePointer()
  if (!resolved) {
    return yield* Effect.fail(new NotFoundError({ entity: "Showcase", id: input.requestingOrganizationId }))
  }

  return resolved
}) satisfies (
  input: ResolveShowcaseInput,
) => Effect.Effect<
  ResolvedShowcase,
  ResolveShowcaseError,
  SqlClient | CacheStore | ShowcaseRepository | OrganizationRepository
>
