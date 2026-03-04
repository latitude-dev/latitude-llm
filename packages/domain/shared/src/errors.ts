import { Data } from "effect"

/**
 * Base error types for domain operations.
 *
 * All domain errors extend from these base types to provide consistent
 * error handling across all domains using Effect.
 */

// Base repository error
export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown
  readonly operation: string
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Internal server error"
}

// Validation error
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}
// Not found error
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string
  readonly id: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `${this.entity} not found`
  }
}

// Conflict error (e.g., duplicate unique values)
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

// Unauthorized error
export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly message: string
}> {
  readonly httpStatus = 401
  get httpMessage() {
    return this.message
  }
}

// RLS/Permission error
export class PermissionError extends Data.TaggedError("PermissionError")<{
  readonly message: string
  readonly workspaceId: string
}> {
  readonly httpStatus = 403
  get httpMessage() {
    return this.message
  }
}

// Common domain error union type
export type DomainError =
  | RepositoryError
  | ValidationError
  | NotFoundError
  | ConflictError
  | UnauthorizedError
  | PermissionError

// Helper to wrap unknown errors into RepositoryError
export const toRepositoryError = (cause: unknown, operation: string): RepositoryError =>
  new RepositoryError({ cause, operation })

// Helper function to check if an error is a specific type
export const isNotFoundError = (error: unknown): error is NotFoundError => error instanceof NotFoundError

export const isConflictError = (error: unknown): error is ConflictError => error instanceof ConflictError

export const isValidationError = (error: unknown): error is ValidationError => error instanceof ValidationError
