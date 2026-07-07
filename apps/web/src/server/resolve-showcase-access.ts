import { type ResolvedShowcase, resolveShowcaseUseCase } from "@domain/showcase"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { OrganizationRepositoryLive, ShowcaseRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { requireSession } from "./auth.ts"
import { getPostgresClient, getRedisClient } from "./clients.ts"

/**
 * The showcase read chokepoint, mirroring `resolveSandboxAccess` /
 * `resolveOrgScope`. Resolves the pinned showcase org+project from the
 * `latitude.showcase` pointer (Redis-cached) after authorizing on the requesting
 * session: authenticated AND the requesting org's `wantsShowcase` flag is true,
 * else the use-case fails `NotFoundError` (→ 404).
 *
 * The returned `organizationId` is the SINGLE resolved value a caller must hand
 * to every layer — `withPostgres`/`withClickHouse` *and* the repo method arg.
 * ClickHouse has no RLS backstop, so the layer org and the query-param org must
 * be this same value or a read escapes the intended tenant. Both the session
 * lookup and the resolution are plain function calls — no server fn invokes
 * another server fn — and the scope is server-resolved, never taken from input,
 * so this path can only ever resolve the one showcase project.
 *
 * The `organizations` + `showcase` reads run under the requesting org's own
 * Postgres scope: `organizations` has no RLS policy, and the showcase pointer is
 * a system/config table with no policy either, so both read correctly without an
 * RLS bypass.
 */
export async function resolveShowcaseAccess(): Promise<ResolvedShowcase> {
  const { organizationId } = await requireSession()

  return Effect.runPromise(
    resolveShowcaseUseCase({ requestingOrganizationId: organizationId }).pipe(
      withPostgres(
        Layer.merge(OrganizationRepositoryLive, ShowcaseRepositoryLive),
        getPostgresClient(),
        organizationId,
      ),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
      withTracing,
    ),
  )
}
