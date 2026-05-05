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

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown
  readonly operation: string
}> {
  constructor(args: { readonly cause: unknown; readonly operation: string }) {
    super(args)

    const causeMessages = collectCauseMessages(args.cause)
    this.message =
      causeMessages.length > 0
        ? `Repository ${args.operation} failed: ${causeMessages.join(" Caused by: ")}`
        : `Repository ${args.operation} failed`

    const causeStack = findCauseStack(args.cause)
    if (causeStack) {
      this.stack = causeStack
    }
  }

  readonly httpStatus = 500
  readonly httpMessage = "Internal server error"
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

export const toRepositoryError = (cause: unknown, operation: string): RepositoryError =>
  new RepositoryError({ cause, operation })

/**
 * Walks `error` and nested `cause` chains (e.g. Drizzle → pg) for Postgres SQLSTATE `23505` (unique_violation).
 */
export const causesIncludePostgresUniqueViolation = (error: unknown): boolean => {
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current)
    if (isRecord(current) && current.code === "23505") {
      return true
    }
    current = isRecord(current) ? current.cause : undefined
  }

  return false
}

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
