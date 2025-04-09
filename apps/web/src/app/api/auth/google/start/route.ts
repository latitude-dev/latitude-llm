import { googleProvider } from '$/services/auth'
import { env } from '@latitude-data/env'
import { generateCodeVerifier, generateState } from 'arctic'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(): Promise<Response> {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = googleProvider.createAuthorizationURL(state, codeVerifier, [
    'openid',
    'profile',
    'email',
  ])

  const cookieStore = await cookies()

  cookieStore.set('google_oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: env.SECURE_COOKIES,
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  })
  cookieStore.set('google_code_verifier', codeVerifier, {
    path: '/',
    httpOnly: true,
    secure: env.SECURE_COOKIES,
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
  })

  return NextResponse.redirect(url)
}
