/** Skip the `last_activity_at` write if one already happened within this window. */
export const SANDBOX_ACTIVITY_STAMP_DEBOUNCE_MS = 5 * 60_000 // 5 minutes

export const SANDBOX_IDLE_ARCHIVE_DAYS = 7

export const SANDBOX_IDLE_SWEEPER_KEY = "sandboxes:idle-sweep"
export const SANDBOX_IDLE_SWEEPER_PATTERN = "0 3 * * *"

/** How long the "last rejected ingest" marker lingers for the sandbox UI to read. */
export const SANDBOX_LAST_REJECTED_INGEST_TTL_SECONDS = 60 * 60 * 24 // a day

export const buildSandboxQuotaKey = (organizationId: string, periodStart: Date): string =>
  `org:${organizationId}:sandbox:quota:${periodStart.toISOString()}`

export const buildSandboxRejectedIngestKey = (organizationId: string): string =>
  `org:${organizationId}:sandbox:last_rejected_ingest`

export const buildSandboxActivityStampKey = (organizationId: string): string =>
  `org:${organizationId}:sandbox:activity_stamped`
