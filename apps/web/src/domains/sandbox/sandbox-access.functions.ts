import { isSandbox, MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { NotFoundError, type OrganizationId, organizationIdSchema, UnauthorizedError, UserId } from "@domain/shared"
import { MembershipRepositoryLive, OrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"
import { getFreshSession } from "../sessions/session.functions.ts"

/**
 * Server-side resolution of "is the caller allowed to act on this sandbox?".
 *
 * Lives in a `.functions.ts` so the TanStack Start Vite compiler can strip
 * its Node-only transitive imports (`@platform/db-postgres`,
 * `@repo/observability`, `server/clients.ts`) from the browser bundle.
 * `sandbox-middleware.ts` would leak them if it owned this logic directly,
 * which is why `adminMiddleware` similarly delegates session work to the
 * `getFreshSession` server fn instead of importing DB modules itself.
 */

interface SandboxAccessDto {
  readonly userId: string
  readonly sandbox: {
    readonly organizationId: string
    readonly name: string
    readonly parentOrgId: string
  }
}

const inputSchema = z.object({ sandboxOrgId: z.unknown() })

export const authorizeSandboxAccess = createServerFn({ method: "GET" })
  .inputValidator(inputSchema)
  .handler(async ({ data }): Promise<SandboxAccessDto> => {
    const session = await getFreshSession()
    if (!session) {
      throw new UnauthorizedError({ message: "Unauthorized" })
    }
    const userId = UserId(session.user.id)

    const parsed = organizationIdSchema.safeParse(data.sandboxOrgId)
    if (!parsed.success) {
      throw new NotFoundError({ entity: "Sandbox", id: String(data.sandboxOrgId ?? "") })
    }
    const sandboxOrgId: OrganizationId = parsed.data

    // The org lookup uses the admin client so it works at any RLS scope —
    // `organizations` has no policy, but `withPostgres`'s default "system"
    // scope is only sanctioned for the admin connection.
    const sandbox = await Effect.runPromise(
      Effect.gen(function* () {
        const orgRepo = yield* OrganizationRepository
        const org = yield* orgRepo
          .findById(sandboxOrgId)
          .pipe(
            Effect.catchTag("NotFoundError", () =>
              Effect.fail(new NotFoundError({ entity: "Sandbox", id: sandboxOrgId })),
            ),
          )
        if (!isSandbox(org)) {
          return yield* Effect.fail(new NotFoundError({ entity: "Sandbox", id: sandboxOrgId }))
        }
        return {
          organizationId: org.id,
          name: org.name,
          parentOrgId: org.parentOrgId,
        }
      }).pipe(withPostgres(OrganizationRepositoryLive, getAdminPostgresClient()), withTracing),
    )

    // Membership check is scoped to the PARENT org (whose `members` rows are
    // RLS-protected) — never the sandbox, never the session's active org. We
    // can only scope here, after the org load told us the parent id.
    const isMember = await Effect.runPromise(
      Effect.gen(function* () {
        const memberRepo = yield* MembershipRepository
        return yield* memberRepo.isMember(sandbox.parentOrgId, userId)
      }).pipe(withPostgres(MembershipRepositoryLive, getPostgresClient(), sandbox.parentOrgId), withTracing),
    )

    if (!isMember) {
      throw new NotFoundError({ entity: "Sandbox", id: sandboxOrgId })
    }

    return {
      userId,
      sandbox: {
        organizationId: sandbox.organizationId,
        name: sandbox.name,
        parentOrgId: sandbox.parentOrgId,
      },
    }
  })
