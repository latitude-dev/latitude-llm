// Fixed identifiers used for every benchmark row. These end up as both:
//   - the `organizationId` / `projectId` passed into the classifier use case
//     (telemetry metadata keys)
//   - the IDs set on the synthetic `TraceDetail` the adapter builds
// Keeping them in one place means the two usages can't silently drift.

export const BENCHMARK_ORG_ID = "a".repeat(24)
export const BENCHMARK_PROJECT_ID = "b".repeat(24)
