import type { DomainEvent } from "@domain/events"
import type { ApiKeyId, OrganizationId } from "@domain/shared"

/**
 * ApiKeyCreated event - emitted when a new API key is generated.
 */
export interface ApiKeyCreatedEvent
  extends DomainEvent<
    "ApiKeyCreated",
    {
      apiKeyId: ApiKeyId
      organizationId: OrganizationId
      name: string
    }
  > {
  readonly name: "ApiKeyCreated"
}

export const createApiKeyCreatedEvent = (params: {
  apiKeyId: ApiKeyId
  organizationId: OrganizationId
  name: string
}): ApiKeyCreatedEvent => ({
  name: "ApiKeyCreated",
  organizationId: params.organizationId,
  payload: {
    apiKeyId: params.apiKeyId,
    organizationId: params.organizationId,
    name: params.name,
  },
})
