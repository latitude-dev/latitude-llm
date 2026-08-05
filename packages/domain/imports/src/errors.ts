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

/**
 * Carries where the blocking import lives, because the limit is org-wide while the imports UI is
 * project-scoped: a conflict raised by a job in another project has to name it, or the user is told
 * an import is running on a page that lists none.
 */
export class ActiveImportConflictError extends Data.TaggedError("ActiveImportConflictError")<{
  readonly activeJobId: string
  readonly activeProjectId: string
  readonly activeSourceProjectName: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `An import of ${this.activeSourceProjectName} is already running. Only one import can run at a time in an organization.`
  }
}

export class ImportRangeInvalidError extends Data.TaggedError("ImportRangeInvalidError")<{
  readonly message: string
  readonly requestedDays: number
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}

/** Raised instead of starting a job that would cap on its first page. */
export class ImportUsageExhaustedError extends Data.TaggedError("ImportUsageExhaustedError")<{
  readonly periodEnd: Date
}> {
  readonly httpStatus = 402
  get httpMessage() {
    return `This organization has no usage left this billing period, so there is nothing to import into. Usage resets on ${this.periodEnd.toISOString().slice(0, 10)}.`
  }
}

export class ImportJobNotFoundError extends Data.TaggedError("ImportJobNotFoundError")<{
  readonly jobId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Import not found"
}

export class ImportJobNotRetryableError extends Data.TaggedError("ImportJobNotRetryableError")<{
  readonly jobId: string
  readonly status: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `This import is ${this.status}; only failed, cancelled, or capped imports can be retried.`
  }
}

/** Raised when a retry's credentials name a different region than the job was created against. */
export class ImportRegionMismatchError extends Data.TaggedError("ImportRegionMismatchError")<{
  readonly jobId: string
  readonly expected: string
  readonly received: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return `These credentials are for the ${this.received} region, but this import ran against ${this.expected}. Use credentials from ${this.expected} or start a new import.`
  }
}

/** Raised when a job is handed to the queue from any state other than `queued`. */
export class ImportJobNotEnqueueableError extends Data.TaggedError("ImportJobNotEnqueueableError")<{
  readonly jobId: string
  readonly status: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return "This import could not be queued because its status changed."
  }
}

export const sanitizedImportError = (error: ImportSourceError): string => {
  const status = error.upstreamStatus !== undefined ? `[${error.upstreamStatus}] ` : ""
  return `${status}${error.category}: ${error.message}`
}
