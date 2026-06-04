import { Data } from "effect"

export class SandboxArchivedError extends Data.TaggedError("SandboxArchivedError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Sandbox is archived (asleep). Reactivate it to resume ingestion."
}

export class SandboxQuotaExceededError extends Data.TaggedError("SandboxQuotaExceededError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Sandbox span quota exceeded for the current period."
}

export class NotSandboxError extends Data.TaggedError("NotSandboxError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "This organization is not a sandbox."
}

export class SandboxAccessDeniedError extends Data.TaggedError("SandboxAccessDeniedError")<{
  readonly organizationId: string
  readonly userId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "You must be a member of the parent organization to manage its sandboxes."
}
export class SandboxNotFoundError extends Data.TaggedError("SandboxNotFoundError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Sandbox not found"
}

export class SandboxActiveCapReachedError extends Data.TaggedError("SandboxActiveCapReachedError")<{
  readonly cap: number
  readonly planSlug: string
}> {
  readonly httpStatus = 403
  get httpMessage() {
    return `Active sandbox limit reached (${this.cap}). Archive or delete a sandbox before adding another.`
  }
}
