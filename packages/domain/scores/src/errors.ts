import { Data } from "effect"

export class ScoreDraftClosedError extends Data.TaggedError("ScoreDraftClosedError")<{
  readonly scoreId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Scores can only be edited while they remain drafts"
}

export class ScoreDraftUpdateConflictError extends Data.TaggedError("ScoreDraftUpdateConflictError")<{
  readonly scoreId: string
  readonly field: "projectId" | "source" | "sourceId"
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `Draft score ${this.scoreId} cannot change ${this.field}`
  }
}
