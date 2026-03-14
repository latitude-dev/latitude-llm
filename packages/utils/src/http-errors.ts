/**
 * Interface for errors that can be returned in an HTTP context.
 */
export interface HttpError {
  readonly _tag: string
  readonly httpStatus: number
  readonly httpMessage: string
}

export class BadRequestError implements HttpError {
  readonly _tag = "BadRequestError"
  readonly httpStatus = 400
  readonly httpMessage: string

  constructor(options: { httpMessage: string; field?: string }) {
    this.httpMessage = options.field ? `${options.httpMessage} ${options.field}` : options.httpMessage
  }
}

export class UnauthorizedError implements HttpError {
  readonly _tag = "HttpUnauthorizedError"
  readonly httpStatus = 401
  readonly httpMessage: string

  constructor(options: { httpMessage?: string } = {}) {
    this.httpMessage = options.httpMessage ?? "Authentication required"
  }
}

export const isHttpError = (error: unknown): error is HttpError => {
  return (
    typeof error === "object" &&
    error !== null &&
    "httpStatus" in error &&
    typeof error.httpStatus === "number" &&
    "httpMessage" in error &&
    typeof error.httpMessage === "string"
  )
}

export const toHttpResponse = (error: unknown): { status: number; body: { error: string } } => {
  if (isHttpError(error)) {
    return {
      status: error.httpStatus,
      body: { error: error.httpMessage },
    }
  }

  return {
    status: 500,
    body: { error: "Internal server error" },
  }
}
