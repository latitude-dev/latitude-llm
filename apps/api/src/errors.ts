/**
 * Interface for errors that can be returned in an HTTP context.
 *
 * Domain errors that need specific HTTP handling should implement this interface
 * to bundle their HTTP status code and message.
 */
interface HttpError {
  readonly _tag: string
  readonly httpStatus: number
  readonly httpMessage: string
}

export class BadRequestError implements HttpError {
  readonly _tag = "BadRequestError"
  readonly httpStatus = 400
  readonly httpMessage: string

  constructor(options: { httpMessage: string; field?: string }) {
    this.httpMessage = options.httpMessage
    if (options.field) {
      this.httpMessage += ` ${options.field}`
    }
  }
}

// Type guard to check if an error has HTTP properties
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

// Helper to convert domain errors to HTTP responses
export const toHttpResponse = (error: unknown): { status: number; body: Record<string, unknown> } => {
  if (isHttpError(error)) {
    return {
      status: error.httpStatus,
      body: { error: error.httpMessage },
    }
  }

  // Default to 500 for unknown errors
  return {
    status: 500,
    body: { error: "Internal server error" },
  }
}
