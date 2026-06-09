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
