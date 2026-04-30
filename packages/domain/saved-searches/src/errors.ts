import { Data } from "effect"

export class SavedSearchNotFoundError extends Data.TaggedError("SavedSearchNotFoundError")<{
  readonly savedSearchId: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `Saved search ${this.savedSearchId} not found`
  }
}

export class DuplicateSavedSearchSlugError extends Data.TaggedError("DuplicateSavedSearchSlugError")<{
  readonly projectId: string
  readonly slug: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `A saved search with slug "${this.slug}" already exists in this project`
  }
}

export class EmptySavedSearchError extends Data.TaggedError("EmptySavedSearchError")<{
  readonly _void?: undefined
}> {
  readonly httpStatus = 400
  readonly httpMessage = "A saved search must have a query, filters, or both"
}

export class InvalidSavedSearchNameError extends Data.TaggedError("InvalidSavedSearchNameError")<{
  readonly field: string
  readonly message: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}
