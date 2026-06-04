import type { NotFoundError, OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Sandbox, SandboxStatus } from "../entities/sandbox.ts"

/**
 * Sandbox lifecycle is *cross-org* management: a parent live org owns sibling
 * sandbox orgs, and the per-plan cap counts sandboxes across that family. The
 * `sandboxes` table's RLS scopes each row to its *own* sandbox org, so no
 * single live-org RLS context can see a parent's sandboxes. These methods are
 * therefore scoped by explicit `organizationId` / `parentOrgId` arguments and
 * run on an RLS-bypassing (admin) `SqlClient`, mirroring the cross-org reads in
 * `@domain/admin`. Authorization is the caller's responsibility (the use-cases
 * gate every call on parent-org membership before touching this port).
 */
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
