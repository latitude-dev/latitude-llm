import {
  LatitudeError,
  UnprocessableEntityError,
} from '@latitude-data/core/lib/errors'
import { captureException } from '$/common/sentry'
import { createMiddleware } from 'hono/factory'

import HttpStatusCodes from '../common/httpStatusCodes'

const errorHandlerMiddleware = () =>
  createMiddleware(async (c, next) => {
    const err = c.error!
    if (!err) return next()

    if (process.env.NODE_ENV !== 'test') {
      captureException(err)
    }

    if (err instanceof UnprocessableEntityError) {
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
        { status: err.statusCode },
      )
    } else {
      return Response.json(
        { message: err.message },
        { status: HttpStatusCodes.BAD_REQUEST },
      )
    }
  })

export default errorHandlerMiddleware
