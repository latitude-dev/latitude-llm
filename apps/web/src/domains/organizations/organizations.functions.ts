import { createMembership, createOrganizationUseCase } from "@domain/organizations"
import type { Membership, Organization } from "@domain/organizations"
import { OrganizationId, UserId, generateId } from "@domain/shared-kernel"
import { createMembershipPostgresRepository, createOrganizationPostgresRepository } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"
import type { CreateOrganizationInput, OrganizationRecord } from "./organizations.types.ts"

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export const listOrganizations = createServerFn({ method: "GET" }).handler(async (): Promise<OrganizationRecord[]> => {
  const { userId } = await requireSession()
  const { db } = getPostgresClient()
  const membershipsRepo = createMembershipPostgresRepository(db)
  const organizationsRepo = createOrganizationPostgresRepository(db)

  const memberships = (await Effect.runPromise(membershipsRepo.findByUserId(userId))) as readonly Membership[]

  const organizations = await Promise.all(
    memberships.map(async (membership) => {
      const organization = (await Effect.runPromise(
        organizationsRepo.findById(membership.organizationId),
      )) as Organization

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: membership.role,
      } satisfies OrganizationRecord
    }),
  )

  return organizations
})

export const createOrganization = createServerFn({ method: "POST" })
  .inputValidator((data: CreateOrganizationInput) => data)
  .handler(async ({ data }): Promise<OrganizationRecord> => {
    const { userId } = await requireSession()
    const { db } = getPostgresClient()
    const membershipsRepo = createMembershipPostgresRepository(db)
    const organizationsRepo = createOrganizationPostgresRepository(db)

    const name = data.name.trim()
    const slug = data.slug ? toSlug(data.slug) : toSlug(data.name)

    const organization = (await Effect.runPromise(
      createOrganizationUseCase(organizationsRepo)({
        id: OrganizationId(generateId()),
        name,
        slug,
        creatorId: UserId(userId),
      }),
    )) as Organization

    await Effect.runPromise(
      membershipsRepo.save(
        createMembership({
          id: generateId(),
          organizationId: organization.id,
          userId: UserId(userId),
          role: "owner",
          confirmedAt: new Date(),
        }),
      ),
    )

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: "owner",
    }
  })
