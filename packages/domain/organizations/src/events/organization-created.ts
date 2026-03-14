import type { DomainEvent } from "@domain/events"
import type { OrganizationId, UserId } from "@domain/shared"

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
  organizationId: params.organizationId,
  payload: {
    organizationId: params.organizationId,
    name: params.name,
    slug: params.slug,
    creatorId: params.creatorId,
  },
})
