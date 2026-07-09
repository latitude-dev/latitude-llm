import { randomBytes } from "node:crypto"
import { ProjectRepository } from "@domain/projects"
import { generateId, type OrganizationId, type ProjectId, SqlClient, type UserId } from "@domain/shared"
import { Effect } from "effect"
import type { ElevenlabsWebhookEndpoint, ElevenlabsWebhookEndpointPublic } from "../entities/webhook-endpoint.ts"
import { ElevenlabsWebhookNotFoundError } from "../errors.ts"
import { ElevenlabsWebhookEndpointRepository } from "../ports/webhook-endpoint-repository.ts"

export interface EnableElevenlabsWebhookInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signingSecret: string
  readonly createdByUserId: UserId
}

export interface EnableElevenlabsWebhookResult {
  readonly endpoint: ElevenlabsWebhookEndpointPublic
  readonly webhookUrl: string
}

export const enableElevenlabsWebhookUseCase = Effect.fn("elevenlabs.enableWebhook")(function* (
  input: EnableElevenlabsWebhookInput & { readonly ingestBaseUrl: string },
) {
  const projectRepo = yield* ProjectRepository
  const project = yield* projectRepo.findById(input.projectId)
  if (project.organizationId !== input.organizationId) {
    return yield* Effect.fail(new ElevenlabsWebhookNotFoundError({ projectId: input.projectId }))
  }

  const sqlClient = yield* SqlClient
  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* ElevenlabsWebhookEndpointRepository
      const existing = yield* repo.findActiveByProjectId(input.projectId)
      if (existing) {
        yield* repo.softRevokeById(existing.id, new Date())
      }

      const now = new Date()
      const endpoint: ElevenlabsWebhookEndpoint = {
        id: generateId<"ElevenlabsWebhookEndpointId">(),
        organizationId: input.organizationId,
        projectId: input.projectId,
        webhookToken: randomBytes(24).toString("hex"),
        signingSecret: input.signingSecret,
        createdByUserId: input.createdByUserId,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      }

      yield* repo.save(endpoint)

      const baseUrl = input.ingestBaseUrl.replace(/\/$/, "")
      return {
        endpoint: {
          id: endpoint.id,
          projectId: endpoint.projectId,
          webhookToken: endpoint.webhookToken,
          createdAt: endpoint.createdAt,
        },
        webhookUrl: `${baseUrl}/v1/webhooks/elevenlabs/${endpoint.webhookToken}`,
      } satisfies EnableElevenlabsWebhookResult
    }),
  )
})

export const disableElevenlabsWebhookUseCase = Effect.fn("elevenlabs.disableWebhook")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}) {
  const repo = yield* ElevenlabsWebhookEndpointRepository
  const existing = yield* repo.findActiveByProjectId(input.projectId)
  if (!existing || existing.organizationId !== input.organizationId) return
  yield* repo.softRevokeById(existing.id, new Date())
})

export const getElevenlabsWebhookUseCase = Effect.fn("elevenlabs.getWebhook")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly ingestBaseUrl: string
}) {
  const repo = yield* ElevenlabsWebhookEndpointRepository
  const existing = yield* repo.findActiveByProjectId(input.projectId)
  if (!existing || existing.organizationId !== input.organizationId) return null

  const baseUrl = input.ingestBaseUrl.replace(/\/$/, "")
  return {
    endpoint: {
      id: existing.id,
      projectId: existing.projectId,
      webhookToken: existing.webhookToken,
      createdAt: existing.createdAt,
    },
    webhookUrl: `${baseUrl}/v1/webhooks/elevenlabs/${existing.webhookToken}`,
  }
})
