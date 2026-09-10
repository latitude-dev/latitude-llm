import { Data } from "effect"

export class InvalidCostMetricCatalogError extends Data.TaggedError("InvalidCostMetricCatalogError")<{
  readonly issues: readonly string[]
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Invalid Cost metric catalog"
}

export class InvalidCostScoringArtifactError extends Data.TaggedError("InvalidCostScoringArtifactError")<{
  readonly artifactVersion?: string
  readonly issues: readonly string[]
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Invalid Cost scoring artifact"
}

export class InvalidLatencyReferenceArtifactError extends Data.TaggedError("InvalidLatencyReferenceArtifactError")<{
  readonly issues: readonly string[]
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Invalid latency reference artifact"
}
