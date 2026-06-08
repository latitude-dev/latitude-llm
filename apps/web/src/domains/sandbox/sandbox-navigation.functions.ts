import { ProjectRepository } from "@domain/projects"
import { organizationIdSchema } from "@domain/shared"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { getCookies, setCookie } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { getPostgresClient } from "../../server/clients.ts"
import { sandboxMiddleware } from "../../server/sandbox-middleware.ts"

/**
 * Per-sandbox "current project" navigation — the sandbox twin of
 * `resolveDefaultProjectSlug` / `rememberLastProjectSlug`. Entering a sandbox
 * should land on a project (last-visited, else first), exactly like Live lands
 * you on `/projects/:slug`. The cookie is keyed by sandbox org id so each
 * sandbox remembers its own last project.
 */

const LAST_SANDBOX_PROJECT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

const cookieName = (sandboxOrgId: string) => `lat-last-sandbox-project-${sandboxOrgId}`

export const resolveDefaultSandboxProjectSlug = createServerFn({ method: "GET" })
  .middleware([sandboxMiddleware])
  .inputValidator(z.object({ sandboxOrgId: organizationIdSchema }))
  .handler(async ({ context, data }): Promise<string | null> => {
    const cookieSlug = getCookies()[cookieName(data.sandboxOrgId)]
    const projects = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.list()
      }).pipe(withPostgres(ProjectRepositoryLive, getPostgresClient(), context.sandbox.organizationId), withTracing),
    )

    const cookieMatch = cookieSlug ? projects.find((p) => p.slug === cookieSlug) : undefined
    const target = cookieMatch ?? projects[0]
    return target?.slug ?? null
  })

export const rememberLastSandboxProjectSlug = createServerFn({ method: "POST" })
  .middleware([sandboxMiddleware])
  .inputValidator(z.object({ sandboxOrgId: organizationIdSchema, slug: z.string().min(1) }))
  .handler(async ({ data }): Promise<void> => {
    setCookie(cookieName(data.sandboxOrgId), data.slug, {
      path: "/",
      sameSite: "lax",
      maxAge: LAST_SANDBOX_PROJECT_COOKIE_MAX_AGE_SECONDS,
    })
  })
