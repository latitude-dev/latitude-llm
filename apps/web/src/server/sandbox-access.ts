import { isSandbox, MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { SandboxRepository } from "@domain/sandboxes"
import { NotFoundError, type OrganizationId, organizationIdSchema, type UserId } from "@domain/shared"
import {
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  SandboxRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getPostgresClient } from "./clients.ts"

/**
 * The sandbox authorization *logic*, as a plain server function — no HTTP/RPC
 * layer. Both the `authorizeSandboxAccess` server fn (used by `sandboxMiddleware`)
 * and `resolveOrgScope` (used inside other server fns) call this directly, so a
 * server fn never invokes another server fn. The caller supplies the already-
 * resolved `userId`; this verifies the sandbox exists and that the user is a
 * member of its *parent* org (the sandbox itself has no member rows).
 *
 * Lives in a server-only module reached exclusively from server-fn handlers, so
 * its Node-only imports are stripped from the browser bundle — the same property
 * the `.functions.ts` wrapper gives `authorizeSandboxAccess`.
 */

interface ResolvedSandboxAccess {
  readonly organizationId: OrganizationId
  readonly name: string
  readonly parentOrgId: OrganizationId
  readonly status: "active" | "archived"
}

export async function resolveSandboxAccess(input: {
  readonly sandboxOrgId: unknown
  readonly userId: UserId
}): Promise<ResolvedSandboxAccess> {
  const parsed = organizationIdSchema.safeParse(input.sandboxOrgId)
  if (!parsed.success) {
    throw new NotFoundError({ entity: "Sandbox", id: String(input.sandboxOrgId ?? "") })
  }
  const sandboxOrgId: OrganizationId = parsed.data

  // The org lookup uses the admin client so it works at any RLS scope —
  // `organizations` has no policy, but `withPostgres`'s default "system" scope
  // is only sanctioned for the admin connection.
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
      // Read the sandbox row's status here (not in a follow-up client request)
      // so route context carries it on first paint — avoids the active→archived
      // flash in the sandbox strip.
      const sandboxRepo = yield* SandboxRepository
      const row = yield* sandboxRepo.findByOrganizationId(sandboxOrgId)
      return { organizationId: org.id, name: org.name, parentOrgId: org.parentOrgId, status: row.status }
    }).pipe(
      withPostgres(Layer.merge(OrganizationRepositoryLive, SandboxRepositoryLive), getAdminPostgresClient()),
      withTracing,
    ),
  )

  // Membership check is scoped to the PARENT org (whose `members` rows are
  // RLS-protected) — never the sandbox, never the session's active org.
  const isMember = await Effect.runPromise(
    Effect.gen(function* () {
      const memberRepo = yield* MembershipRepository
      return yield* memberRepo.isMember(sandbox.parentOrgId, input.userId)
    }).pipe(withPostgres(MembershipRepositoryLive, getPostgresClient(), sandbox.parentOrgId), withTracing),
  )
  if (!isMember) {
    throw new NotFoundError({ entity: "Sandbox", id: sandboxOrgId })
  }

  return sandbox
}
