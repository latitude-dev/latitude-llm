import { Data } from "effect"

export const defineError = <Tag extends string>(tag: Tag, httpStatus: number, httpMessage: string) => {
  const Base = Data.TaggedError(tag)
  Object.defineProperty(Base.prototype, "httpStatus", { value: httpStatus, writable: false, enumerable: true })
  Object.defineProperty(Base.prototype, "httpMessage", { value: httpMessage, writable: false, enumerable: true })
  return Base
}

export const defineErrorDynamic = <Tag extends string, Fields extends Record<string, any>>(
  tag: Tag,
  httpStatus: number,
  getHttpMessage: (fields: Fields) => string,
) => {
  const Base = Data.TaggedError(tag)
  Object.defineProperty(Base.prototype, "httpStatus", { value: httpStatus, writable: false, enumerable: true })
  Object.defineProperty(Base.prototype, "httpMessage", {
    get(this: Fields) {
      return getHttpMessage(this)
    },
    enumerable: true,
  })
  return Base
}

export class RepositoryError extends defineError("RepositoryError", 500, "Internal server error")<{
  readonly cause: unknown
  readonly operation: string
}> {}

export class ValidationError extends defineErrorDynamic("ValidationError", 400, (f: { message: string }) => f.message)<{
  readonly field: string
  readonly message: string
}> {}

export class NotFoundError extends defineErrorDynamic(
  "NotFoundError",
  404,
  (f: { entity: string }) => `${f.entity} not found`,
)<{
  readonly entity: string
  readonly id: string
}> {}

export class ConflictError extends defineErrorDynamic(
  "ConflictError",
  409,
  (f: { entity: string; field: string; value: string }) => `${f.entity} with ${f.field} '${f.value}' already exists`,
)<{
  readonly entity: string
  readonly field: string
  readonly value: string
}> {}

export class UnauthorizedError extends defineErrorDynamic(
  "UnauthorizedError",
  401,
  (f: { message: string }) => f.message,
)<{
  readonly message: string
}> {}

export class BadRequestError extends defineErrorDynamic("BadRequestError", 400, (f: { message: string }) => f.message)<{
  readonly message: string
}> {}

export class PermissionError extends defineErrorDynamic("PermissionError", 403, (f: { message: string }) => f.message)<{
  readonly message: string
  readonly organizationId: string
}> {}

export type DomainError =
  | RepositoryError
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
