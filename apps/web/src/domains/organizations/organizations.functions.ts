import {
  createMembership,
  createOrganizationUseCase,
  MembershipRepository,
  OrganizationRepository,
} from "@domain/organizations"
import { UserId } from "@domain/shared"
import { MembershipRepositoryLive, OrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

interface OrganizationRecord {
  readonly id: string
  readonly name: string
}

export const countUserOrganizations = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<number> => {
    const { userId } = await requireSession()
    const adminClient = getAdminPostgresClient()

    const members = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* MembershipRepository
        return yield* repo.findByUserId(userId)
      }).pipe(withPostgres(MembershipRepositoryLive, adminClient)),
    )
    return members.length
  })

export const getOrganization = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<OrganizationRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const org = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.findById(organizationId)
      }).pipe(withPostgres(OrganizationRepositoryLive, client, organizationId)),
    )
    return { id: org.id, name: org.name }
  })

export const updateOrganizationName = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<OrganizationRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const org = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        const existing = yield* repo.findById(organizationId)
        const updated = { ...existing, name: data.name, updatedAt: new Date() }
        yield* repo.save(updated)
        return updated
      }).pipe(withPostgres(OrganizationRepositoryLive, client, organizationId)),
    )
    return { id: org.id, name: org.name }
  })

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<OrganizationRecord> => {
    const { userId } = await requireSession()
    const adminClient = getAdminPostgresClient()

    const repoLayer = Layer.merge(OrganizationRepositoryLive, MembershipRepositoryLive)

    const org = await Effect.runPromise(
      Effect.gen(function* () {
        const organization = yield* createOrganizationUseCase({
          name: data.name,
          creatorId: UserId(userId),
        })

        // Add the creator as an owner member
        const membershipRepo = yield* MembershipRepository
        const membership = createMembership({
          organizationId: organization.id,
          userId: UserId(userId),
          role: "owner",
        })
        yield* membershipRepo.save(membership)

        return organization
      }).pipe(withPostgres(repoLayer, adminClient)),
    )
    return { id: org.id, name: org.name }
  })
