import {
  disableElevenlabsWebhookUseCase,
  enableElevenlabsWebhookUseCase,
  getElevenlabsWebhookUseCase,
} from "@domain/elevenlabs"
import { OrganizationId, ProjectId, UserId } from "@domain/shared"
import { ElevenlabsWebhookEndpointRepositoryLive, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

const ingestBaseUrl = () => Effect.runSync(parseEnv("LAT_INGEST_URL", "string", "http://localhost:3002"))

const repositoryLayers = Layer.mergeAll(ElevenlabsWebhookEndpointRepositoryLive, ProjectRepositoryLive)

interface ElevenlabsWebhookRecord {
  readonly id: string
  readonly webhookUrl: string
  readonly createdAt: string
}

export const getElevenlabsWebhook = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const result = await Effect.runPromise(
      getElevenlabsWebhookUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(data.projectId),
        ingestBaseUrl: ingestBaseUrl(),
      }).pipe(
        withPostgres(ElevenlabsWebhookEndpointRepositoryLive, getPostgresClient(), OrganizationId(organizationId)),
        withTracing,
      ),
    )

    if (!result) return null
    return {
      id: result.endpoint.id,
      webhookUrl: result.webhookUrl,
      createdAt: result.endpoint.createdAt.toISOString(),
    } satisfies ElevenlabsWebhookRecord
  })

export const enableElevenlabsWebhook = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      signingSecret: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    const { organizationId, userId } = await requireSession()
    const result = await Effect.runPromise(
      enableElevenlabsWebhookUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(data.projectId),
        signingSecret: data.signingSecret,
        createdByUserId: UserId(userId),
        ingestBaseUrl: ingestBaseUrl(),
      }).pipe(withPostgres(repositoryLayers, getPostgresClient(), OrganizationId(organizationId)), withTracing),
    )

    return {
      id: result.endpoint.id,
      webhookUrl: result.webhookUrl,
      createdAt: result.endpoint.createdAt.toISOString(),
    } satisfies ElevenlabsWebhookRecord
  })

export const disableElevenlabsWebhook = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    await Effect.runPromise(
      disableElevenlabsWebhookUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(data.projectId),
      }).pipe(withPostgres(repositoryLayers, getPostgresClient(), OrganizationId(organizationId)), withTracing),
    )
  })
