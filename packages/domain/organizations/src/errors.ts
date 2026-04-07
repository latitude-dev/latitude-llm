import { Data } from "effect"

export class MembershipNotFoundError extends Data.TaggedError("MembershipNotFoundError")<{
  readonly membershipId?: string
  readonly userId?: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Membership not found"
}

export class CannotRemoveSelfError extends Data.TaggedError("CannotRemoveSelfError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "You cannot remove yourself from the workspace"
}

export class NotOwnerError extends Data.TaggedError("NotOwnerError")<{
  readonly userId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Only the organization owner can transfer ownership"
}

export class CannotTransferToSelfError extends Data.TaggedError("CannotTransferToSelfError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Cannot transfer ownership to yourself"
}

export class CannotTransferToNonMemberError extends Data.TaggedError("CannotTransferToNonMemberError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Can only transfer ownership to an existing member"
}

export class NotAdminError extends Data.TaggedError("NotAdminError")<{
  readonly userId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Only admins can change member roles"
}

export class CannotChangeOwnerRoleError extends Data.TaggedError("CannotChangeOwnerRoleError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Cannot change the owner's role. Use ownership transfer instead."
}

export class CannotChangeOwnRoleError extends Data.TaggedError("CannotChangeOwnRoleError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "You cannot change your own role"
}

export class TargetMembershipNotFoundError extends Data.TaggedError("TargetMembershipNotFoundError")<{
  readonly userId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Target member not found"
}

export class SlugGenerationError extends Data.TaggedError("SlugGenerationError")<{
  readonly message: string
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return this.message
  }
}
