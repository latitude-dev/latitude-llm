import { googleProvider } from '$/services/auth'
import { env } from '@latitude-data/env'
import { generateCodeVerifier, generateState } from 'arctic'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const returnTo = searchParams.get('returnTo')

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = googleProvider.createAuthorizationURL(state, codeVerifier, [
    'openid',
    'profile',
    'email',
  ])

  const cookieStore = await cookies()
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: env.SECURE_COOKIES,
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  } as const

  cookieStore.set('google_oauth_state', state, cookieOptions)
  cookieStore.set('google_code_verifier', codeVerifier, cookieOptions)
  if (returnTo) {
    cookieStore.set('returnTo', returnTo, cookieOptions)
  }

  return NextResponse.redirect(url)
}
