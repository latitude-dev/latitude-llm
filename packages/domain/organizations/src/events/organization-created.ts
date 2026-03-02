import type { DomainEvent } from "@domain/events"
import type { OrganizationId, UserId } from "@domain/shared-kernel"

/**
 * OrganizationCreated event - emitted when a new organization is created.
 */
export type OrganizationCreatedEvent = DomainEvent<
  "OrganizationCreated",
  {
    organizationId: OrganizationId
    name: string
    slug: string
    creatorId: UserId
  }
>

export const createOrganizationCreatedEvent = (params: {
  organizationId: OrganizationId
  name: string
  slug: string
  creatorId: UserId
}): OrganizationCreatedEvent => ({
  name: "OrganizationCreated",
  workspaceId: params.organizationId,
  payload: {
    organizationId: params.organizationId,
    name: params.name,
    slug: params.slug,
    creatorId: params.creatorId,
  },
})
