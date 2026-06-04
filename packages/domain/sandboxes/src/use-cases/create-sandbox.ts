import { resolveEffectivePlan } from "@domain/billing"
import {
  createOrganization,
  generateUniqueOrganizationSlugUseCase,
  MembershipRepository,
  type Organization,
  OrganizationRepository,
} from "@domain/organizations"
import { generateId, type OrganizationId, SqlClient, type UserId } from "@domain/shared"
import { Effect } from "effect"
import { createSandbox, type Sandbox } from "../entities/sandbox.ts"
import { SandboxAccessDeniedError, SandboxActiveCapReachedError } from "../errors.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"

export interface CreateSandboxInput {
  /** The live org the sandbox is a sibling of. Authz is evaluated against it. */
  readonly parentOrganizationId: OrganizationId
  readonly actorUserId: UserId
  readonly name: string
}

export interface CreateSandboxResult {
  readonly organization: Organization
  readonly sandbox: Sandbox
}

export const createSandboxUseCase = Effect.fn("sandboxes.createSandbox")(function* (input: CreateSandboxInput) {
  yield* Effect.annotateCurrentSpan("organization.id", input.parentOrganizationId)

  const memberships = yield* MembershipRepository
  const isMember = yield* memberships.isMember(input.parentOrganizationId, input.actorUserId)
  if (!isMember) {
    return yield* new SandboxAccessDeniedError({
      organizationId: input.parentOrganizationId,
      userId: input.actorUserId,
    })
  }

  const { plan } = yield* resolveEffectivePlan(input.parentOrganizationId)

  const slug = yield* generateUniqueOrganizationSlugUseCase({ name: input.name })
  const organizationId = generateId<"OrganizationId">()
  const organization = createOrganization({
    id: organizationId,
    name: input.name,
    slug,
    parentOrgId: input.parentOrganizationId,
  })
  const sandbox = createSandbox({ organizationId, createdByUserId: input.actorUserId })

  const sqlClient = yield* SqlClient
  yield* sqlClient.transaction(
    Effect.gen(function* () {
      const organizationRepository = yield* OrganizationRepository
      const sandboxRepository = yield* SandboxRepository
      // Lock + count + insert in one tx so concurrent creates can't both pass
      // the cap (the lock serializes this section per parent org).
      yield* sandboxRepository.lockParentForCapCheck(input.parentOrganizationId)
      const activeCount = yield* sandboxRepository.countActiveByParentOrgId(input.parentOrganizationId)
      if (activeCount >= plan.sandboxActiveCap) {
        return yield* new SandboxActiveCapReachedError({ cap: plan.sandboxActiveCap, planSlug: plan.slug })
      }
      yield* organizationRepository.save(organization)
      yield* sandboxRepository.create(sandbox)
    }),
  )

  return { organization, sandbox } satisfies CreateSandboxResult
})
