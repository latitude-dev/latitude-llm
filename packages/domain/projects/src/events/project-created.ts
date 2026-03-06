import type { DomainEvent } from "@domain/events"
import type { OrganizationId, ProjectId, UserId } from "@domain/shared"

/**
 * ProjectCreated event - emitted when a new project is created.
 */
export interface ProjectCreatedEvent
  extends DomainEvent<
    "ProjectCreated",
    {
      projectId: ProjectId
      name: string
      description: string | null
      createdById: UserId | null
    }
  > {
  readonly name: "ProjectCreated"
}

export const createProjectCreatedEvent = (params: {
  projectId: ProjectId
  organizationId: OrganizationId
  name: string
  description: string | null
  createdById: UserId | null
}): ProjectCreatedEvent => ({
  name: "ProjectCreated",
  organizationId: params.organizationId,
  payload: {
    projectId: params.projectId,
    name: params.name,
    description: params.description,
    createdById: params.createdById,
  },
})
