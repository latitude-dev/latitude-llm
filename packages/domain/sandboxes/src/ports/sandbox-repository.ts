import type { NotFoundError, OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Sandbox, SandboxStatus } from "../entities/sandbox.ts"

/**
 * A sandbox joined to its `organizations` row (for name/slug — a sandbox *is*
 * an org) and its creator/owner (`created_by_user_id`, a user in the parent
 * org). Powers the parent-org switcher and the "your sandboxes" settings list,
 * neither of which can read the sandbox's own RLS scope.
 */
export interface SandboxListItem {
  readonly sandbox: Sandbox
  readonly organizationName: string
  readonly organizationSlug: string
  readonly owner: {
    readonly userId: UserId
    readonly name: string | null
    readonly email: string
  } | null
}

export class SandboxRepository extends Context.Service<
  SandboxRepository,
  {
    findOptional(): Effect.Effect<Sandbox | null, RepositoryError, SqlClient>
    stampActivity(): Effect.Effect<void, RepositoryError, SqlClient>
    create: (sandbox: Sandbox) => Effect.Effect<void, RepositoryError, SqlClient>
    findByOrganizationId: (
      organizationId: OrganizationId,
    ) => Effect.Effect<Sandbox, NotFoundError | RepositoryError, SqlClient>
    countActiveByParentOrgId: (parentOrgId: OrganizationId) => Effect.Effect<number, RepositoryError, SqlClient>
    archiveIdle: (cutoff: Date) => Effect.Effect<number, RepositoryError, SqlClient>
    listByParentOrgId: (
      parentOrgId: OrganizationId,
    ) => Effect.Effect<readonly SandboxListItem[], RepositoryError, SqlClient>
    /**
     * Take a transaction-scoped advisory lock keyed on the parent org, so the
     * active-cap "count then write" sequence is serialized per parent and two
     * concurrent create/reactivate calls can't both pass the cap. Must be called
     * inside a `SqlClient.transaction` — the lock releases when that tx ends.
     */
    lockParentForCapCheck: (parentOrgId: OrganizationId) => Effect.Effect<void, RepositoryError, SqlClient>
    setStatus: (
      organizationId: OrganizationId,
      status: SandboxStatus,
    ) => Effect.Effect<void, RepositoryError, SqlClient>
    /** Remove the attributes row (the org row + cascade is handled separately). */
    delete: (organizationId: OrganizationId) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/sandboxes/SandboxRepository") {}
