import { OrganizationRepository } from "@domain/organizations"
import { purgeOrganizationProjectsUseCase } from "@domain/projects"
import { type OrganizationId, SqlClient, type UserId } from "@domain/shared"
import { Effect } from "effect"
import { loadAuthorizedSandboxOrg } from "../helpers.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"

export interface DeleteSandboxInput {
  readonly sandboxOrganizationId: OrganizationId
  readonly actorUserId: UserId
}

export const deleteSandboxUseCase = Effect.fn("sandboxes.deleteSandbox")(function* (input: DeleteSandboxInput) {
  yield* Effect.annotateCurrentSpan("organization.id", input.sandboxOrganizationId)

  yield* loadAuthorizedSandboxOrg(input.sandboxOrganizationId, input.actorUserId)

  const sqlClient = yield* SqlClient
  if (sqlClient.organizationId !== input.sandboxOrganizationId) {
    return yield* Effect.die(
      `deleteSandbox must run scoped to the sandbox org (${input.sandboxOrganizationId}), got ${sqlClient.organizationId}`,
    )
  }

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      const sandboxes = yield* SandboxRepository
      const organizations = yield* OrganizationRepository
      yield* purgeOrganizationProjectsUseCase({
        actorUserId: input.actorUserId,
      })
      yield* sandboxes.delete(input.sandboxOrganizationId)
      yield* organizations.delete(input.sandboxOrganizationId)
    }),
  )
})
