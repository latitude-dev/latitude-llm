import type { OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { createMembership } from "../entities/membership.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { createOrganizationUseCase } from "./create-organization.ts"

export interface CreateOrganizationWithOwnerInput {
  readonly id?: OrganizationId
  readonly name: string
  readonly creatorId: UserId
}

export const createOrganizationWithOwnerUseCase = (input: CreateOrganizationWithOwnerInput) =>
  Effect.gen(function* () {
    const organization = yield* createOrganizationUseCase(input)

    const membershipRepo = yield* MembershipRepository
    const membership = createMembership({
      organizationId: organization.id,
      userId: input.creatorId,
      role: "owner",
    })
    yield* membershipRepo.save(membership)

    return organization
  })
