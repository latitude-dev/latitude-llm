import { resolveEffectivePlan } from "@domain/billing"
import { type OrganizationId, SqlClient, type UserId } from "@domain/shared"
import { Effect } from "effect"
import { SandboxActiveCapReachedError } from "../errors.ts"
import { loadAuthorizedSandboxOrg } from "../helpers.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"

export interface ReactivateSandboxInput {
  readonly sandboxOrganizationId: OrganizationId
  readonly actorUserId: UserId
}

/**
 * Wake a sleeping sandbox back to `active`, iff doing so won't exceed the
 * parent plan's active-sandbox cap. Idempotent on an already-active sandbox.
 */
export const reactivateSandboxUseCase = Effect.fn("sandboxes.reactivateSandbox")(function* (
  input: ReactivateSandboxInput,
) {
  yield* Effect.annotateCurrentSpan("organization.id", input.sandboxOrganizationId)

  const { parentOrgId } = yield* loadAuthorizedSandboxOrg(input.sandboxOrganizationId, input.actorUserId)

  const sandboxes = yield* SandboxRepository
  const sandbox = yield* sandboxes.findByOrganizationId(input.sandboxOrganizationId)
  if (sandbox.status === "active") {
    return sandbox
  }

  const { plan } = yield* resolveEffectivePlan(parentOrgId)

  const sqlClient = yield* SqlClient
  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const sandboxRepository = yield* SandboxRepository
      // Lock + count + flip in one tx so reactivation can't race creation (or
      // another reactivation) past the cap.
      yield* sandboxRepository.lockParentForCapCheck(parentOrgId)
      const activeCount = yield* sandboxRepository.countActiveByParentOrgId(parentOrgId)
      if (activeCount + 1 > plan.sandboxActiveCap) {
        return yield* new SandboxActiveCapReachedError({ cap: plan.sandboxActiveCap, planSlug: plan.slug })
      }
      yield* sandboxRepository.setStatus(input.sandboxOrganizationId, "active")
      // Re-read so the returned entity carries the DB-updated `updatedAt`.
      return yield* sandboxRepository.findByOrganizationId(input.sandboxOrganizationId)
    }),
  )
})
