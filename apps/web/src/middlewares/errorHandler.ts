import { LatitudeError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { captureException } from '$/helpers/captureException'
import { type NextRequest, NextResponse } from 'next/server'
import debug from '@latitude-data/core/lib/debug'

export function errorHandler(handler: any) {
  return async (req: NextRequest, res: any) => {
    try {
      return await handler(req, res)
    } catch (error) {
      if (env.NODE_ENV === 'development') {
        debug((error as Error).message)
      }

      if (error instanceof LatitudeError) {
        return NextResponse.json(
          { message: error.message, details: error.details },
          { status: error.statusCode },
        )
      }

      captureException(error as Error)

      return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 })
    }
  }
}
