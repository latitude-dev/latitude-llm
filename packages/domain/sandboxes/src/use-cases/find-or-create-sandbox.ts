import { MembershipRepository } from "@domain/organizations"
import type { OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { SandboxAccessDeniedError } from "../errors.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"
import { createSandboxUseCase } from "./create-sandbox.ts"

export interface FindOrCreateSandboxInput {
  /** The live org the sandbox is a sibling of. Authz is evaluated against it. */
  readonly parentOrganizationId: OrganizationId
  readonly actorUserId: UserId
  /** Name for the sandbox when this call has to create it. */
  readonly name: string
}

export interface FindOrCreateSandboxResult {
  readonly sandboxOrganizationId: OrganizationId
  /** True when this call created the sandbox — callers may roll it back if a follow-up step fails. */
  readonly createdNow: boolean
}

/**
 * The org's single sandbox, created on first use, preferring an active one
 * over archived siblings. An archived sandbox still resolves when it's all
 * there is — waking it is the sandbox shell's "Activate" flow, not this one.
 */
export const findOrCreateSandboxUseCase = Effect.fn("sandboxes.findOrCreateSandbox")(function* (
  input: FindOrCreateSandboxInput,
) {
  yield* Effect.annotateCurrentSpan("organization.id", input.parentOrganizationId)

  // The find path reads on the admin client (sandbox rows are RLS-scoped to
  // their own org), so membership is checked here rather than left to RLS.
  const memberships = yield* MembershipRepository
  const isMember = yield* memberships.isMember(input.parentOrganizationId, input.actorUserId)
  if (!isMember) {
    return yield* new SandboxAccessDeniedError({
      organizationId: input.parentOrganizationId,
      userId: input.actorUserId,
    })
  }

  const sandboxes = yield* SandboxRepository
  const family = yield* sandboxes.listByParentOrgId(input.parentOrganizationId)
  const existing = family.find((sandbox) => sandbox.status === "active") ?? family[0]
  if (existing) {
    return { sandboxOrganizationId: existing.organizationId, createdNow: false } satisfies FindOrCreateSandboxResult
  }

  const { organization } = yield* createSandboxUseCase(input)
  return { sandboxOrganizationId: organization.id, createdNow: true } satisfies FindOrCreateSandboxResult
})
