import {
  generateUniqueOrganizationSlugUseCase,
  OrganizationRepository,
  updateOrganizationUseCase,
} from "@domain/organizations"
import { OrganizationId, UserId } from "@domain/shared"
import { MembershipRepositoryLive, OrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession, requireUserSession } from "../../server/auth.ts"
import { getAdminPostgresClient, getBetterAuth, getOutboxWriter, getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async () => {
    const userId = await requireUserSession()
    const client = getAdminPostgresClient()
    const repoLayer = Layer.merge(OrganizationRepositoryLive, MembershipRepositoryLive)
    return await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.findByUserId(UserId(userId))
      }).pipe(withPostgres(repoLayer, client)),
    )
  })

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const userId = await requireUserSession()
    const adminClient = getAdminPostgresClient()
    const slug = await Effect.runPromise(
      generateUniqueOrganizationSlugUseCase({ name: data.name }).pipe(
        withPostgres(OrganizationRepositoryLive, adminClient),
      ),
    )

    const organization = await getBetterAuth().api.createOrganization({
      body: {
        name: data.name,
        slug,
        userId,
        keepCurrentActiveOrganization: false,
      },
      headers: await getRequestHeaders(),
    })

    const outboxWriter = getOutboxWriter()
    await outboxWriter.write({
      eventName: "OrganizationCreated",
      aggregateId: organization.id,
      organizationId: OrganizationId(organization.id),
      payload: {
        organizationId: organization.id,
        name: data.name,
        slug,
      },
    })
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
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return await Effect.runPromise(
      updateOrganizationUseCase({ name: data.name, settings: data.settings }).pipe(
        withPostgres(OrganizationRepositoryLive, client, organizationId),
      ),
    )
  })
