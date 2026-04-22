import { Data } from "effect"

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const toNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

const toCauseMessage = (cause: unknown): string | null => {
  if (cause instanceof Error) {
    return toNonEmptyString(cause.message)
  }

  if (typeof cause === "string") {
    return toNonEmptyString(cause)
  }

  if (isRecord(cause)) {
    return toNonEmptyString(cause.message) ?? toNonEmptyString(cause.detail)
  }

  return null
}

const collectCauseMessages = (cause: unknown): string[] => {
  const messages: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = cause

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current)

    const message = toCauseMessage(current)
    if (message && !messages.includes(message)) {
      messages.push(message)
    }

    current = isRecord(current) ? current.cause : undefined
  }

  return messages
}

const findCauseStack = (cause: unknown): string | undefined => {
  const seen = new Set<unknown>()
  let current: unknown = cause

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current)

    if (current instanceof Error && current.stack) {
      return current.stack
    }

    if (isRecord(current) && typeof current.stack === "string" && current.stack.length > 0) {
      return current.stack
    }

    current = isRecord(current) ? current.cause : undefined
  }

  return undefined
}

/**
 * Capture a synchronous stack trace at the call site of a `SqlClient.query` /
 * `SqlClient.transaction` invocation. The underlying database error (from
 * drizzle / node-postgres) is created several microtasks later, past
 * `processTicksAndRejections`, so V8's async stack traces do not reach back to
 * the repository or use-case that issued the query. Capturing here preserves
 * that context so `RepositoryError.stack` shows *where in our code* the
 * failing query originated.
 */
export const captureCallSite = (label: string): Error => {
  const error = new Error(label)
  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(error, captureCallSite)
  }
  return error
}

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown
  readonly operation: string
  readonly callSite?: Error
}> {
  constructor(args: { readonly cause: unknown; readonly operation: string; readonly callSite?: Error }) {
    super(args)

    const causeMessages = collectCauseMessages(args.cause)
    this.message =
      causeMessages.length > 0
        ? `Repository ${args.operation} failed: ${causeMessages.join(" Caused by: ")}`
        : `Repository ${args.operation} failed`

    const causeStack = findCauseStack(args.cause)
    const callSiteFrames = extractStackFrames(args.callSite)

    if (callSiteFrames) {
      const causedBy = causeStack ? `\nCaused by: ${causeStack}` : ""
      this.stack = `RepositoryError: ${this.message}\n${callSiteFrames}${causedBy}`
    } else if (causeStack) {
      this.stack = causeStack
    }
  }

  readonly httpStatus = 500
  readonly httpMessage = "Internal server error"
}

const extractStackFrames = (error: Error | undefined): string => {
  const stack = error?.stack
  if (!stack) return ""
  const newlineIdx = stack.indexOf("\n")
  return newlineIdx === -1 ? "" : stack.slice(newlineIdx + 1)
}

/**
 * Raised when two `SqlClient.transaction()` calls overlap on the same client
 * instance (e.g. `Effect.all(..., { concurrency: 2 })`). Callers should run
 * transactions sequentially or use separate SqlClient layer instances.
 */
// Empty payload: concurrent use is purely a client lifecycle mistake.
export class ConcurrentSqlTransactionError extends Data.TaggedError("ConcurrentSqlTransactionError")<{
  readonly _void?: undefined
}> {
  readonly httpStatus = 409
  readonly httpMessage =
    "Concurrent transaction requests on the same database client are not allowed. Run transactions sequentially or use separate client instances."
}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string
  readonly id: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `${this.entity} not found`
  }
}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly entity: string
  readonly field: string
  readonly value: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `${this.entity} with ${this.field} '${this.value}' already exists`
  }
}

export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly message: string
}> {
  readonly httpStatus = 401
  get httpMessage() {
    return this.message
  }
}

export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly message: string
  readonly retryAfterSeconds: number
}> {
  readonly httpStatus = 429
  get httpMessage() {
    return this.message
  }
}

export class BadRequestError extends Data.TaggedError("BadRequestError")<{
  readonly message: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}

export class PermissionError extends Data.TaggedError("PermissionError")<{
  readonly message: string
  readonly organizationId: string
}> {
  readonly httpStatus = 403
  get httpMessage() {
    return this.message
  }
}

export type DomainError =
  | RepositoryError
  | ConcurrentSqlTransactionError
  | ValidationError
  | NotFoundError
  | ConflictError
  | UnauthorizedError
  | BadRequestError
  | PermissionError

export const toRepositoryError = (cause: unknown, operation: string, callSite?: Error): RepositoryError =>
  new RepositoryError(callSite ? { cause, operation, callSite } : { cause, operation })

export const isNotFoundError = (error: unknown): error is NotFoundError => error instanceof NotFoundError

export const isConflictError = (error: unknown): error is ConflictError => error instanceof ConflictError

export const isValidationError = (error: unknown): error is ValidationError => error instanceof ValidationError

export class CacheError extends Data.TaggedError("CacheError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return this.message
  }
}

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly cause: unknown
  readonly operation: string
}> {
  constructor(args: { readonly cause: unknown; readonly operation: string }) {
    super(args)

    const causeMessages = collectCauseMessages(args.cause)
    this.message =
      causeMessages.length > 0
        ? `Storage ${args.operation} failed: ${causeMessages.join(" Caused by: ")}`
        : `Storage ${args.operation} failed`

    const causeStack = findCauseStack(args.cause)
    if (causeStack) {
      this.stack = causeStack
    }
  }

  readonly httpStatus = 500
  readonly httpMessage = "Storage operation failed"
}
