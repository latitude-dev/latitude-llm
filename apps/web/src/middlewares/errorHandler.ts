import { debuglog } from 'util'

import { LatitudeError } from '@latitude-data/core/lib/errors'
import env from '$/env'
import { NextRequest, NextResponse } from 'next/server'

export function errorHandler(handler: any) {
  return async (req: NextRequest, res: NextResponse) => {
    try {
      return await handler(req, res)
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

      return NextResponse.json(
        { message: 'Internal Server Error' },
        { status: 500 },
      )
    }
  }
}
