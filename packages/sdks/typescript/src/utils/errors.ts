import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  ApiResponseCode,
  DbErrorRef,
  LatitudeErrorCodes,
  RunErrorCodes,
} from './errorConstants'

function getErrorMessage({
  status,
  message,
  errorCode,
}: {
  status: number
  message: string
  errorCode: ApiResponseCode
}) {
  const httpExeception = ApiErrorCodes.HTTPException
  const internalServerError = ApiErrorCodes.InternalServerError
  const isUnexpectedError =
    errorCode === httpExeception || errorCode === internalServerError
  if (isUnexpectedError) {
    return `Unexpected API Error: ${status} ${message}`
  }

  return message
}

export class LatitudeApiError extends Error {
  status: number
  message: string
  serverResponse: string
  errorCode: ApiResponseCode
  dbErrorRef?: DbErrorRef

  constructor({
    status,
    message,
    serverResponse,
    errorCode,
    dbErrorRef,
  }: {
    status: number
    message: string
    serverResponse: string
    errorCode: ApiResponseCode
    dbErrorRef?: DbErrorRef
  }) {
    const msg = getErrorMessage({ status, message, errorCode })
    super(message)

    this.status = status
    this.message = msg
    this.serverResponse = serverResponse
    this.errorCode = errorCode
    this.dbErrorRef = dbErrorRef
  }
}

export { ApiErrorCodes, LatitudeErrorCodes, RunErrorCodes }
export type { ApiErrorJsonResponse, ApiResponseCode, DbErrorRef }
