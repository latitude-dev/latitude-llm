import { Data } from "effect"

/**
 * Onboarding errors
 */

export class WorkspaceCreationError extends Data.TaggedError("WorkspaceCreationError")<{
  readonly message: string
  readonly userId: string
  readonly cause?: unknown
}> {}

export class MembershipCreationError extends Data.TaggedError("MembershipCreationError")<{
  readonly message: string
  readonly userId: string
  readonly workspaceId: string
  readonly cause?: unknown
}> {}
