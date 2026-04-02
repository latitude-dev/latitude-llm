import { NotFoundError, type OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { Organization } from "../entities/organization.ts"
import type { OrganizationRepository } from "../ports/organization-repository.ts"

type OrganizationRepositoryShape = (typeof OrganizationRepository)["Service"]

export const createFakeOrganizationRepository = (overrides?: Partial<OrganizationRepositoryShape>) => {
  const organizations = new Map<OrganizationId, Organization>()

  const repository: OrganizationRepositoryShape = {
    findById: (id) => {
      const org = organizations.get(id)
      if (!org) return Effect.fail(new NotFoundError({ entity: "Organization", id }))
      return Effect.succeed(org)
    },

    listByUserId: () => Effect.succeed([]),
    findByUserId: () => Effect.succeed([]),

    save: (org) =>
      Effect.sync(() => {
        organizations.set(org.id, org)
      }),

    delete: (id) =>
      Effect.sync(() => {
        organizations.delete(id)
      }),

    existsBySlug: (slug) => Effect.succeed([...organizations.values()].some((o) => o.slug === slug)),

    ...overrides,
  }

  return { repository, organizations }
}
