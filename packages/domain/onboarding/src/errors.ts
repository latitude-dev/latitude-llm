import { Data } from "effect"

/**
 * Onboarding errors
 */

export class WorkspaceCreationError extends Data.TaggedError("WorkspaceCreationError")<{
  readonly message: string
  readonly userId: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return this.message
  }
}

export class MembershipCreationError extends Data.TaggedError("MembershipCreationError")<{
  readonly message: string
  readonly userId: string
  readonly organizationId: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return this.message
  }
}
