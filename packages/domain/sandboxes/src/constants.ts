/** Skip the `last_activity_at` write if one already happened within this window. */
export const SANDBOX_ACTIVITY_STAMP_DEBOUNCE_MS = 5 * 60_000 // 5 minutes

/** Coalesce realtime trace signals (liveness + upsert) to at most one per kind, per trace, per window. */
export const SANDBOX_TRACE_SIGNAL_COALESCE_MS = 300

/** How long the "last rejected ingest" marker lingers for the sandbox UI to read. */
export const SANDBOX_LAST_REJECTED_INGEST_TTL_SECONDS = 60 * 60 * 24 // a day

export const buildSandboxQuotaKey = (organizationId: string, periodStart: Date): string =>
  `org:${organizationId}:sandbox:quota:${periodStart.toISOString()}`

export const buildSandboxRejectedIngestKey = (organizationId: string): string =>
  `org:${organizationId}:sandbox:last_rejected_ingest`

export const buildSandboxActivityStampKey = (organizationId: string): string =>
  `org:${organizationId}:sandbox:activity_stamped`

export const buildSandboxTracesChannel = (organizationId: string): string => `org:${organizationId}:sandbox:traces`

export const buildSandboxTraceCoalesceKey = (organizationId: string, kind: string, traceId: string): string =>
  `org:${organizationId}:sandbox:traces:coalesce:${kind}:${traceId}`
