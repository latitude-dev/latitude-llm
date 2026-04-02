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

export class ScoreAlreadyOwnedByIssueError extends Data.TaggedError("ScoreAlreadyOwnedByIssueError")<{
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

export class IssueNotFoundForDetailsGenerationError extends Data.TaggedError("IssueNotFoundForDetailsGenerationError")<{
  readonly issueId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Issue not found for details generation"
}

export class MissingIssueOccurrencesForDetailsGenerationError extends Data.TaggedError(
  "MissingIssueOccurrencesForDetailsGenerationError",
)<{
  readonly projectId: string
}> {
  readonly httpStatus = 400
  readonly httpMessage = "Issue details generation requires issue occurrences"
}

export class IssueNotFoundForAssignmentError extends Data.TaggedError("IssueNotFoundForAssignmentError")<{
  readonly issueId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Issue not found for assignment"
}

export type CheckEligibilityError =
  | ScoreNotFoundForDiscoveryError
  | ScoreDiscoveryOrganizationMismatchError
  | ScoreDiscoveryProjectMismatchError
  | DraftScoreNotEligibleForDiscoveryError
  | ErroredScoreNotEligibleForDiscoveryError
  | ScoreAlreadyOwnedByIssueError
  | MissingScoreFeedbackForDiscoveryError
  | PassedScoreNotEligibleForDiscoveryError
