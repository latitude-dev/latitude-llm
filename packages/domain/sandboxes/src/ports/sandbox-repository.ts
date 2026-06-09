import type { NotFoundError, OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Sandbox, SandboxStatus } from "../entities/sandbox.ts"

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
    /**
     * The sandbox org ids under a parent live org (active *and* archived), newest
     * first. Powers the sidebar toggle, which only needs to know whether the
     * org's single sandbox exists and its id — the parent scope can't read the
     * sandbox's own RLS scope, so this is resolved on the admin client.
     */
    listOrganizationIdsByParentOrgId: (
      parentOrgId: OrganizationId,
    ) => Effect.Effect<readonly OrganizationId[], RepositoryError, SqlClient>
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
