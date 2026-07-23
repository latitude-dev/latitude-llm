import { Data } from "effect"

export class TaxonomyClusterNotFoundError extends Data.TaggedError("TaxonomyClusterNotFoundError")<{
  readonly clusterId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Taxonomy cluster not found"
}

export class TaxonomyClusterLockUnavailableError extends Data.TaggedError("TaxonomyClusterLockUnavailableError")<{
  readonly clusterId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Taxonomy cluster lock unavailable"
}

export class TaxonomyQualityGateError extends Data.TaggedError("TaxonomyQualityGateError")<{
  readonly projectId: string
  readonly findings: readonly string[]
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Taxonomy quality gate failed"
}

export class CustomBehaviorNameInvalidError extends Data.TaggedError("CustomBehaviorNameInvalidError")<{
  readonly field: string
  readonly message: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}

export class CustomBehaviorFilterInvalidError extends Data.TaggedError("CustomBehaviorFilterInvalidError")<{
  readonly message: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}

export class CustomBehaviorLimitReachedError extends Data.TaggedError("CustomBehaviorLimitReachedError")<{
  readonly projectId: string
  readonly limit: number
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return `This project already has the maximum of ${this.limit} custom behaviors`
  }
}
