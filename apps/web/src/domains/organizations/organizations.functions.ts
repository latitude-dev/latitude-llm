import type { Organization } from "@domain/organizations"
import {
  createOrganizationWithOwnerUseCase,
  MembershipRepository,
  OrganizationRepository,
  updateOrganizationUseCase,
} from "@domain/organizations"
import { UserId } from "@domain/shared"
import { MembershipRepositoryLive, OrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

const toRecord = (org: Organization) => ({
  id: org.id,
  name: org.name,
  settings: {
    keepMonitoring: org.settings?.keepMonitoring,
  },
})

export type OrganizationRecord = ReturnType<typeof toRecord>

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
    return toRecord(org)
  })

const organizationSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(),
})

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(256).optional(),
      settings: organizationSettingsSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<OrganizationRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const org = await Effect.runPromise(
      updateOrganizationUseCase({ name: data.name, settings: data.settings }).pipe(
        withPostgres(OrganizationRepositoryLive, client, organizationId),
      ),
    )

    return toRecord(org)
  })

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<OrganizationRecord> => {
    const { userId } = await requireSession()
    const adminClient = getAdminPostgresClient()

    const repoLayer = Layer.merge(OrganizationRepositoryLive, MembershipRepositoryLive)

    const org = await Effect.runPromise(
      createOrganizationWithOwnerUseCase({
        name: data.name,
        creatorId: UserId(userId),
      }).pipe(withPostgres(repoLayer, adminClient)),
    )
    return toRecord(org)
  })
