import { AbortedError, LatitudeError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { captureException } from '$/helpers/captureException'
import { NextRequest, NextResponse } from 'next/server'
import debug from '@latitude-data/core/lib/debug'
import { RouteHandler } from './types'

interface AbortError extends DOMException {
  name: 'AbortError'
  reason: string
}

export function isAbortError(error: unknown): error is AbortError {
  if (!error) return false
  return (
    !!error &&
    ((error instanceof Error && error.name === 'ResponseAborted') ||
      error instanceof AbortedError)
  )
}

export function errorHandler<T>(handler: RouteHandler<T>) {
  const isDev = env.NODE_ENV === 'development'
  return async (req: NextRequest, res: any) => {
    try {
      return await handler(req, res)
    } catch (error) {
      if (isDev) {
        debug((error as Error).message)
      }

      if (isAbortError(error)) {
        return NextResponse.json(
          { message: 'Request aborted by client' },
          { status: 499 },
        )
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
