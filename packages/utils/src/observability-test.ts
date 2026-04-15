/**
 * Thrown by `GET …/observability-test/error` handlers so APM/logs can filter on a
 * stable name (`LatitudeObservabilityTestError`) per `DD_SERVICE`.
 */
export class LatitudeObservabilityTestError extends Error {
  readonly service: string
  override readonly name = "LatitudeObservabilityTestError"

  constructor(service: string) {
    super(`Synthetic observability test error (${service}) — safe to ignore in triage`)
    this.service = service
  }
}
