import { Data } from "effect"

export class TaxonomyClusterNotFoundError extends Data.TaggedError("TaxonomyClusterNotFoundError")<{
  readonly clusterId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Taxonomy cluster not found"
}

export class TaxonomyRunNotFoundError extends Data.TaggedError("TaxonomyRunNotFoundError")<{
  readonly runId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Taxonomy run not found"
}

export class TaxonomyClusterLockUnavailableError extends Data.TaggedError("TaxonomyClusterLockUnavailableError")<{
  readonly clusterId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Taxonomy cluster lock unavailable"
}

export class TaxonomyGardenLockUnavailableError extends Data.TaggedError("TaxonomyGardenLockUnavailableError")<{
  readonly projectId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Taxonomy gardening lock unavailable"
}

export class TaxonomyEmbeddingDimensionMismatchError extends Data.TaggedError(
  "TaxonomyEmbeddingDimensionMismatchError",
)<{
  readonly expected: number
  readonly actual: number
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Taxonomy embedding dimension mismatch"
}

export class TaxonomyCentroidModelMismatchError extends Data.TaggedError("TaxonomyCentroidModelMismatchError")<{
  readonly clusterId: string
  readonly expectedModel: string
  readonly actualModel: string
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Taxonomy centroid model mismatch"
}

export class TaxonomyGardeningTimeoutError extends Data.TaggedError("TaxonomyGardeningTimeoutError")<{
  readonly projectId: string
  readonly runId: string
}> {
  readonly httpStatus = 408
  readonly httpMessage = "Taxonomy gardening run exceeded its time budget"
}

export class TaxonomyObservationNotFoundError extends Data.TaggedError("TaxonomyObservationNotFoundError")<{
  readonly sessionId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Taxonomy observation not found"
}

export class TaxonomyQualityGateError extends Data.TaggedError("TaxonomyQualityGateError")<{
  readonly projectId: string
  readonly findings: readonly string[]
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Taxonomy quality gate failed"
}
