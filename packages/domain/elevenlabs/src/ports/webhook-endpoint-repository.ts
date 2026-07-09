import type { ElevenlabsWebhookEndpointId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { ElevenlabsWebhookEndpoint } from "../entities/webhook-endpoint.ts"

export interface ElevenlabsWebhookEndpointRepositoryShape {
  readonly findActiveByProjectId: (
    projectId: ProjectId,
  ) => Effect.Effect<ElevenlabsWebhookEndpoint | null, RepositoryError, SqlClient>

  readonly findActiveByWebhookToken: (
    webhookToken: string,
  ) => Effect.Effect<ElevenlabsWebhookEndpoint | null, RepositoryError, SqlClient>

  readonly save: (endpoint: ElevenlabsWebhookEndpoint) => Effect.Effect<void, RepositoryError, SqlClient>

  readonly softRevokeById: (
    id: ElevenlabsWebhookEndpointId,
    revokedAt: Date,
  ) => Effect.Effect<void, RepositoryError, SqlClient>
}

export class ElevenlabsWebhookEndpointRepository extends Context.Service<
  ElevenlabsWebhookEndpointRepository,
  ElevenlabsWebhookEndpointRepositoryShape
>()("@domain/elevenlabs/ElevenlabsWebhookEndpointRepository") {}
