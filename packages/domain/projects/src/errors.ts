import type { OrganizationId, ProjectId } from "@domain/shared"
import { Data } from "effect"

export class InvalidProjectNameError extends Data.TaggedError("InvalidProjectNameError")<{
  readonly field?: string
  readonly message?: string
  readonly name?: string
  readonly reason?: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason ?? this.message ?? "Invalid project name"
  }
}

export class ProjectNotFoundError extends Data.TaggedError("ProjectNotFoundError")<{
  readonly id: ProjectId
  readonly organizationId: OrganizationId
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Project not found"
}
