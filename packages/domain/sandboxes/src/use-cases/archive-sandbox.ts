import type { OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { loadAuthorizedSandboxOrg } from "../helpers.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"

export interface ArchiveSandboxInput {
  readonly sandboxOrganizationId: OrganizationId
  readonly actorUserId: UserId
}

/**
 * Put a sandbox to sleep. Archiving frees a slot toward the per-plan active
 * cap; it is non-destructive (data ages out via retention). Idempotent on an
 * already-archived sandbox.
 */
export const archiveSandboxUseCase = Effect.fn("sandboxes.archiveSandbox")(function* (input: ArchiveSandboxInput) {
  yield* Effect.annotateCurrentSpan("organization.id", input.sandboxOrganizationId)

  yield* loadAuthorizedSandboxOrg(input.sandboxOrganizationId, input.actorUserId)

  const sandboxes = yield* SandboxRepository
  const sandbox = yield* sandboxes.findByOrganizationId(input.sandboxOrganizationId)
  if (sandbox.status === "archived") {
    return sandbox
  }

  yield* sandboxes.setStatus(input.sandboxOrganizationId, "archived")
  // Re-read so the returned entity carries the DB-updated `updatedAt`.
  return yield* sandboxes.findByOrganizationId(input.sandboxOrganizationId)
})
