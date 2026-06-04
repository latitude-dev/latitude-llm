import { Data } from "effect"

/**
 * Ingestion refused because the sandbox is archived (asleep). Mirrors billing's
 * `NoCreditsRemainingError` (402): a loud, pre-persist 4xx. 403 — and crucially
 * *not* 429 — so OTLP exporters treat it as non-retryable and drop the batch
 * instead of retry-looping. The `kind` surfaced at the HTTP boundary is
 * `"SandboxArchived"`.
 */
export class SandboxArchivedError extends Data.TaggedError("SandboxArchivedError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Sandbox is archived (asleep). Reactivate it to resume ingestion."
}

/**
 * Ingestion refused because the sandbox exceeded its per-period span quota.
 * Same loud-refuse path as {@link SandboxArchivedError}; `kind` is
 * `"SandboxQuotaExceeded"`.
 */
export class SandboxQuotaExceededError extends Data.TaggedError("SandboxQuotaExceededError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Sandbox span quota exceeded for the current period."
}
