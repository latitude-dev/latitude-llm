import {
  LatitudeError,
  UnprocessableEntityError,
} from '@latitude-data/core/lib/errors'
import { NextResponse } from 'next/server'

export default async function apiRoute(fn: () => any) {
  try {
    return await fn()
  } catch (error) {
    const err = error as Error

    if (err instanceof UnprocessableEntityError) {
      return NextResponse.json(
        {
          name: err.name,
          message: err.message,
          details: err.details,
        },
        {
          status: err.statusCode,
        },
      )
    } else if (err instanceof LatitudeError) {
      return NextResponse.json(
        {
          message: err.message,
          details: err.details,
        },
        {
          status: err.statusCode,
        },
      )
    } else {
      return NextResponse.json(
        { message: err.message },
        {
          status: 422,
        },
      )
    }
  }
}
