import { ProjectRepository } from "@domain/projects"
import { SHOWCASE_PROJECT_SLUG } from "@domain/shared"
import { resolveShowcaseUseCase } from "@domain/showcase"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  ShowcaseRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"
import { type ProjectRecord, toRecord } from "../projects/projects.functions.ts"
import { SHOWCASE_PROJECT_NAME } from "../projects/showcase-project.ts"

/**
 * Resolves the current shared Showcase project as a `ProjectRecord`, or `null`
 * when no showcase exists or the requesting org's `wantsShowcase` is false (both
 * surface as the resolver's `NotFoundError`, swallowed to `null` here).
 *
 * Two Postgres scopes, deliberately: the resolver runs under the *requesting*
 * org (it authorizes on that org's flag and reads the RLS-free pointer/org
 * tables), while the project read runs under the *resolved showcase* org — the
 * single org id the resolver hands back — since the project row belongs to that
 * tenant and org-scoped RLS would otherwise hide it.
 *
 * The returned record presents the reserved slug + demo name (not the underlying
 * project's real slug/name), so the client-collection merge and the
 * `/projects/lat-demo` loader both key off the stable sentinel while blue/green
 * regeneration rotates the real project id underneath.
 */
export const getShowcaseProjectRecord = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProjectRecord | null> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const resolved = await Effect.runPromise(
      resolveShowcaseUseCase({ requestingOrganizationId: organizationId }).pipe(
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        withPostgres(Layer.merge(OrganizationRepositoryLive, ShowcaseRepositoryLive), client, organizationId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )
    if (!resolved) return null

    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findById(resolved.currentProjectId)
      }).pipe(withPostgres(ProjectRepositoryLive, client, resolved.organizationId), withTracing),
    )

    return {
      ...toRecord(project),
      name: SHOWCASE_PROJECT_NAME,
      slug: SHOWCASE_PROJECT_SLUG,
      isShowcase: true,
    }
  },
)
