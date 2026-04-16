import { Data } from "effect"

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown
  readonly operation: string
}> {
  constructor(args: { readonly cause: unknown; readonly operation: string }) {
    super(args)

    if (args.cause instanceof Error && args.cause.stack) {
      this.stack = args.cause.stack
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
  readonly httpStatus = 500
  readonly httpMessage = "Storage operation failed"
}
