import { unsafelyGetApiKey } from '@latitude-data/core'
import { NextRequest, NextResponse } from 'next/server'

import env from './env'
import { apiUnauthorized } from './helpers/api/errors'

export class LatitudeRequest extends NextRequest {
  workspaceId?: number
}

export async function middleware(request: LatitudeRequest) {
  const { headers } = request
  const [type, token] = headers.get('Authorization')?.split(' ') ?? []
  if (type !== 'Bearer' || token !== env.LATITUDE_API_KEY) {
    return apiUnauthorized()
  }

  const result = await unsafelyGetApiKey({ uuid: token })
  if (result.error) return apiUnauthorized()

  request.workspaceId = result.value.workspaceId

  return NextResponse.next()
}

export const config = {
  matcher: '/api/v1/(.*)',
}
