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

export class InvitationNotFoundError extends Data.TaggedError("InvitationNotFoundError")<{
  readonly invitationId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Invitation not found"
}

export class AlreadyMemberError extends Data.TaggedError("AlreadyMemberError")<{
  readonly email: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "This email already belongs to a member of the organization"
}

export class AlreadyInvitedError extends Data.TaggedError("AlreadyInvitedError")<{
  readonly email: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "An invitation for this email is already pending"
}

export class InvitationLimitReachedError extends Data.TaggedError("InvitationLimitReachedError")<{
  readonly limit: number
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return `Pending invitation limit reached (${this.limit}). Cancel an existing invitation before sending a new one.`
  }
}

export class CannotInviteAsOwnerError extends Data.TaggedError("CannotInviteAsOwnerError")<Record<never, never>> {
  readonly httpStatus = 400
  readonly httpMessage = "Cannot invite a new member at the owner role. Use ownership transfer after they accept."
}

export class CannotRemoveOwnerError extends Data.TaggedError("CannotRemoveOwnerError")<{
  readonly userId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Cannot remove the organization owner. Transfer ownership first."
}
