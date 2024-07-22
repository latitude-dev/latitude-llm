import { NextResponse } from 'next/server'

export function apiNotFound(msg?: string) {
  return NextResponse.json(
    { error: msg || 'Not Found' },
    {
      status: 404,
    },
  )
}

export function apiUnauthorized(msg?: string) {
  return NextResponse.json(
    { error: msg || 'Unauthorized' },
    {
      status: 401,
    },
  )
}
