import {
  LatitudeError,
  UnprocessableEntityError,
} from '@latitude-data/core/lib/errors'
import { HTTPException } from 'hono/http-exception'

import { captureException } from '$/common/sentry'

import HttpStatusCodes from '../common/httpStatusCodes'

const errorHandlerMiddleware = (err: Error) => {
  if (process.env.NODE_ENV !== 'test') {
    captureException(err)
  }

  if (err instanceof HTTPException) {
    return Response.json(
      { message: err.message },
      { status: err.status, headers: err.res?.headers },
    )
  } else if (err instanceof UnprocessableEntityError) {
    return Response.json(
      {
        name: err.name,
        message: err.message,
        details: err.details,
      },
      { status: err.statusCode },
    )
  } else if (err instanceof LatitudeError) {
    return Response.json(
      {
        message: err.message,
        details: err.details,
      },
      { status: err.statusCode, headers: err.headers },
    )
  } else {
    return Response.json(
      { message: err.message },
      { status: HttpStatusCodes.INTERNAL_SERVER_ERROR },
    )
  }
}

export default errorHandlerMiddleware
