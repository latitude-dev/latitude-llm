import { NextRequest, NextResponse } from 'next/server'

import env from './env'

export function middleware(req: NextRequest) {
  const header = req.headers.get('Authorization')
  const key = header?.match(/^Bearer (.*)$/)?.[1]
  if (key !== env.LATITUDE_API_KEY)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
