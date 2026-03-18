export interface HttpError {
  readonly _tag: string
  readonly httpStatus: number
  readonly httpMessage: string
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
