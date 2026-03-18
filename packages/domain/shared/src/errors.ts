import { Data } from "effect"

/**
 * Error factory that bakes HTTP metadata into every domain error at definition
 * time. All domain errors must use one of these factories — never extend
 * `Data.TaggedError` directly.
 */
export const defineError = <Tag extends string>(tag: Tag, httpStatus: number, httpMessage: string) => {
  class Base extends Data.TaggedError(tag)<{}> {
    readonly httpStatus = httpStatus
    readonly httpMessage = httpMessage
  }
  return Base as unknown as new <A extends Record<string, unknown> = {}>(
    args: {} extends A ? void : { readonly [K in keyof A]: A[K] },
  ) => Data.TaggedError.Constructor<Tag>["prototype"] & Readonly<A> & { readonly httpStatus: number; readonly httpMessage: string }
}

export const defineErrorDynamic = <Tag extends string, Fields extends Record<string, unknown>>(
  tag: Tag,
  httpStatus: number,
  getHttpMessage: (fields: Fields) => string,
) => {
  class Base extends Data.TaggedError(tag)<Fields> {
    readonly httpStatus = httpStatus
    get httpMessage(): string {
      return getHttpMessage(this as unknown as Fields)
    }
  }
  return Base
}

export class RepositoryError extends defineError("RepositoryError", 500, "Internal server error")<{
  readonly cause: unknown
  readonly operation: string
}> {}

export class ValidationError extends defineErrorDynamic(
  "ValidationError",
  400,
  (f: { message: string }) => f.message,
)<{
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

export class BadRequestError extends defineErrorDynamic(
  "BadRequestError",
  400,
  (f: { message: string }) => f.message,
)<{
  readonly message: string
}> {}

export class PermissionError extends defineErrorDynamic(
  "PermissionError",
  403,
  (f: { message: string }) => f.message,
)<{
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
