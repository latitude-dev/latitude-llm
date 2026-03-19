import type { DomainEvent } from "@domain/events"
import type { OrganizationId, ProjectId } from "@domain/shared"

export interface ProjectCreatedEvent
  extends DomainEvent<
    "ProjectCreated",
    {
      projectId: ProjectId
      name: string
    }
  > {
  readonly name: "ProjectCreated"
}

export const createProjectCreatedEvent = (params: {
  projectId: ProjectId
  organizationId: OrganizationId
  name: string
}): ProjectCreatedEvent => ({
  name: "ProjectCreated",
  organizationId: params.organizationId,
  payload: {
    projectId: params.projectId,
    name: params.name,
  },
})
