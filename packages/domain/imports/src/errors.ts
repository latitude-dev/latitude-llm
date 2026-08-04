import { Data } from "effect"

export const IMPORT_ERROR_CATEGORIES = [
  "auth",
  "rate_limited",
  "server_error",
  "transport",
  "config",
  "mapping",
] as const
export type ImportErrorCategory = (typeof IMPORT_ERROR_CATEGORIES)[number]

export class ImportSourceError extends Data.TaggedError("ImportSourceError")<{
  readonly category: ImportErrorCategory
  readonly message: string
  readonly retryable: boolean
  readonly retryAfterMs?: number
  readonly upstreamStatus?: number
}> {}

export class ActiveImportConflictError extends Data.TaggedError("ActiveImportConflictError")<{
  readonly activeJobId: string
}> {}

export class ImportRangeInvalidError extends Data.TaggedError("ImportRangeInvalidError")<{
  readonly message: string
  readonly requestedDays: number
}> {}

/** Raised instead of starting a job that would cap on its first page. */
export class ImportUsageExhaustedError extends Data.TaggedError("ImportUsageExhaustedError")<{
  readonly periodEnd: Date
}> {}

export class ImportJobNotFoundError extends Data.TaggedError("ImportJobNotFoundError")<{
  readonly jobId: string
}> {}

export class ImportJobNotRetryableError extends Data.TaggedError("ImportJobNotRetryableError")<{
  readonly jobId: string
  readonly status: string
}> {}

/** Raised when a retry's credentials name a different region than the job was created against. */
export class ImportRegionMismatchError extends Data.TaggedError("ImportRegionMismatchError")<{
  readonly jobId: string
  readonly expected: string
  readonly received: string
}> {}

/** Raised when a job is handed to the queue from any state other than `queued`. */
export class ImportJobNotEnqueueableError extends Data.TaggedError("ImportJobNotEnqueueableError")<{
  readonly jobId: string
  readonly status: string
}> {}

export const sanitizedImportError = (error: ImportSourceError): string => {
  const status = error.upstreamStatus !== undefined ? `[${error.upstreamStatus}] ` : ""
  return `${status}${error.category}: ${error.message}`
}
