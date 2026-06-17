import { Data } from "effect"

export class ScoreNotFoundForDiscoveryError extends Data.TaggedError("ScoreNotFoundForDiscoveryError")<{
  readonly scoreId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Score not found for issue discovery"
}

export class ScoreDiscoveryOrganizationMismatchError extends Data.TaggedError(
  "ScoreDiscoveryOrganizationMismatchError",
)<{
  readonly scoreId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Score organization does not match issue discovery input"
}

export class ScoreDiscoveryProjectMismatchError extends Data.TaggedError("ScoreDiscoveryProjectMismatchError")<{
  readonly scoreId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Score project does not match issue discovery input"
}

export class DraftScoreNotEligibleForDiscoveryError extends Data.TaggedError("DraftScoreNotEligibleForDiscoveryError")<{
  readonly scoreId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Draft scores are not eligible for issue discovery"
}

export class ErroredScoreNotEligibleForDiscoveryError extends Data.TaggedError(
  "ErroredScoreNotEligibleForDiscoveryError",
)<{
  readonly scoreId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Errored scores are not eligible for issue discovery"
}

export class ScoreAlreadyOwnedBySignalError extends Data.TaggedError("ScoreAlreadyOwnedBySignalError")<{
  readonly scoreId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Score is already assigned to an issue"
}

export class MissingScoreFeedbackForDiscoveryError extends Data.TaggedError("MissingScoreFeedbackForDiscoveryError")<{
  readonly scoreId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Score feedback is required for issue discovery"
}

export class PassedScoreNotEligibleForDiscoveryError extends Data.TaggedError(
  "PassedScoreNotEligibleForDiscoveryError",
)<{
  readonly scoreId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Passed scores are not eligible for issue discovery"
}

export class SignalNotFoundForDetailsGenerationError extends Data.TaggedError("SignalNotFoundForDetailsGenerationError")<{
  readonly signalId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Signal not found for details generation"
}

export class MissingSignalOccurrencesForDetailsGenerationError extends Data.TaggedError(
  "MissingSignalOccurrencesForDetailsGenerationError",
)<{
  readonly projectId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Signal details generation requires issue occurrences"
}

export class SignalNotFoundForAssignmentError extends Data.TaggedError("SignalNotFoundForAssignmentError")<{
  readonly signalId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Signal not found for assignment"
}

export class SignalNotFoundForEscalationCheckError extends Data.TaggedError("SignalNotFoundForEscalationCheckError")<{
  readonly signalId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Signal not found for escalation check"
}

export class SignalDiscoveryLockUnavailableError extends Data.TaggedError("SignalDiscoveryLockUnavailableError")<{
  readonly projectId: string
  readonly lockKey: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Signal discovery serialization lock is currently unavailable"
}

const eligibilityErrors = [
  ScoreNotFoundForDiscoveryError,
  ScoreDiscoveryOrganizationMismatchError,
  ScoreDiscoveryProjectMismatchError,
  DraftScoreNotEligibleForDiscoveryError,
  ErroredScoreNotEligibleForDiscoveryError,
  ScoreAlreadyOwnedBySignalError,
  MissingScoreFeedbackForDiscoveryError,
  PassedScoreNotEligibleForDiscoveryError,
] as const

export type CheckEligibilityError = InstanceType<(typeof eligibilityErrors)[number]>

export const isEligibilityError = (error: unknown): error is CheckEligibilityError => {
  return eligibilityErrors.some((err) => error instanceof err)
}
