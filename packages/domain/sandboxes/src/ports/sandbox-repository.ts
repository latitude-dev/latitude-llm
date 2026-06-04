import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Sandbox } from "../entities/sandbox.ts"

export interface SandboxRepositoryShape {
  /**
   * The current RLS org's sandbox attributes row, or `null` when the org is not
   * a sandbox. A `sandboxes` row exists iff `parent_org_id IS NOT NULL`, so this
   * single scoped read resolves the sandbox bit (and the `status` for the
   * archived-refusal gate) at the top of ingest.
   */
  findOptional(): Effect.Effect<Sandbox | null, RepositoryError, SqlClient>
  /** Stamp `last_activity_at = now()` for the current RLS org's sandbox row. */
  stampActivity(): Effect.Effect<void, RepositoryError, SqlClient>
}

export class SandboxRepository extends Context.Service<SandboxRepository, SandboxRepositoryShape>()(
  "@domain/sandboxes/SandboxRepository",
) {}
