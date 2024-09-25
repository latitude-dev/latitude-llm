import { LatitudeError } from '@latitude-data/core/lib/errors'
import { NextRequest, NextResponse } from 'next/server'

export function errorHandler(handler: any) {
  return async (req: NextRequest, res: NextResponse) => {
    try {
      return await handler(req, res)
    } catch (error) {
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
