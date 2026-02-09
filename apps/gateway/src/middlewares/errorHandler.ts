import { ApiErrorCodes } from '@latitude-data/constants/errors'
import {
  LatitudeError,
  UnprocessableEntityError,
  ChainError,
} from '@latitude-data/constants/errors'
import http from '$/common/http'
import { captureException } from '$/common/tracer'
import { HTTPException } from 'hono/http-exception'

function unprocessableExtraParameters(error: UnprocessableEntityError) {
  const isChainError = error instanceof ChainError
  if (!isChainError) return { name: error.name, errorCode: error.name }

  const base = { name: 'DocumentRunError', errorCode: error.errorCode }
  const runError = error.runError

  if (!runError) return base

  return {
    ...base,
    dbErrorRef: {
      entityUuid: runError.errorableUuid,
      entityType: runError.errorableType,
    },
  }
}

const errorHandlerMiddleware = (err: Error) => {
  const normalizedError =
    err instanceof Error
      ? err
      : new Error(typeof err === 'string' ? err : 'Unknown error')

  if (!(err instanceof Error)) {
    normalizedError.cause = err
  }

  const shouldCapture =
    process.env.NODE_ENV !== 'test' &&
    (err instanceof HTTPException
      ? err.status >= 500
      : err instanceof UnprocessableEntityError || err instanceof LatitudeError
        ? err.statusCode >= 500
        : true)

  if (err instanceof HTTPException) {
    if (shouldCapture) {
      captureException(normalizedError)
    }

    return Response.json(
      {
        name: ApiErrorCodes.HTTPException,
        errorCode: ApiErrorCodes.HTTPException,
        message: err.message,
        details: { cause: err.cause },
      },
      { status: err.status, headers: err.res?.headers },
    )
  } else if (err instanceof UnprocessableEntityError) {
    if (shouldCapture) {
      captureException(normalizedError)
    }

    return Response.json(
      {
        ...unprocessableExtraParameters(err),
        message: err.message,
        details: err.details,
      },
      { status: err.statusCode },
    )
  } else if (err instanceof LatitudeError) {
    if (shouldCapture) {
      captureException(normalizedError)
    }

    return Response.json(
      {
        name: err.name,
        errorCode: err.name,
        message: err.message,
        details: err.details,
      },
      { status: err.statusCode, headers: err.headers },
    )
  } else {
    if (shouldCapture) {
      captureException(normalizedError)
    }

    return Response.json(
      {
        name: 'InternalServerError',
        errorCode: ApiErrorCodes.InternalServerError,
        message: normalizedError.message,
        details: { cause: normalizedError.cause },
      },
      { status: http.Status.INTERNAL_SERVER_ERROR },
    )
  }
}

export default errorHandlerMiddleware
