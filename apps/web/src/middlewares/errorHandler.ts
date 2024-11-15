import { debuglog } from 'util'

import { LatitudeError } from '@latitude-data/core/lib/errors'
import env from '$/env'
import { captureException } from '$/helpers/captureException'
import {
  AuthContext,
  DefaultParams,
  HandlerFn,
} from '$/middlewares/authHandler'
import { NextRequest, NextResponse } from 'next/server'

export function errorHandler<
  IReq extends DefaultParams,
  IResp extends object = {},
>(handler: HandlerFn<IReq, IResp>) {
  return async (req: NextRequest, context: AuthContext<IReq>) => {
    try {
      return await handler(req, context)
    } catch (error) {
      if (env.NODE_ENV === 'development') {
        debuglog((error as Error).message)
      }

      if (error instanceof LatitudeError) {
        return NextResponse.json(
          { message: error.message, details: error.details },
          { status: error.statusCode },
        )
      }

      captureException(error as Error)

      return NextResponse.json(
        { message: 'Internal Server Error' },
        { status: 500 },
      )
    }
  }
}
