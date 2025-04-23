import { googleProvider } from '$/services/auth'
import { cookies } from 'next/headers'
import { decodeIdToken, OAuth2RequestError, OAuth2Tokens } from 'arctic'
import { NextRequest } from 'next/server'
import { findOrCreateUserFromOAuth } from '@latitude-data/core/services/auth/findOrCreateUserFromOAuth'
import { setSession } from '$/services/auth/setSession'
import { ObjectParser } from '@pilcrowjs/object-parser'
import { NextResponse } from 'next/server'
import { OAuthProvider } from '@latitude-data/core/schema'
import { env } from '@latitude-data/env'

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookiesStore = await cookies()
  const storedState = cookiesStore.get('google_oauth_state')?.value ?? null
  const codeVerifier = cookiesStore.get('google_code_verifier')?.value ?? null

  // 1. Validate state
  if (
    !code ||
    !state ||
    !storedState ||
    state !== storedState ||
    !codeVerifier
  ) {
    return new Response('Invalid OAuth state or code', { status: 400 })
  }

  try {
    // 2. Validate code and get tokens/user info
    let tokens: OAuth2Tokens
    try {
      tokens = await googleProvider.validateAuthorizationCode(
        code,
        codeVerifier,
      )
    } catch {
      return new Response('Please restart the process.', {
        status: 400,
      })
    }

    const claims = decodeIdToken(tokens.idToken())
    const claimsParser = new ObjectParser(claims)
    const googleId = claimsParser.getString('sub')
    const name = claimsParser.getString('name')
    const email = claimsParser.getString('email')

    // 3. Find or create user using the core service
    const userResult = await findOrCreateUserFromOAuth({
      providerId: OAuthProvider.GOOGLE,
      providerUserId: googleId,
      email,
      name: name ?? email, // Use name, fallback to email
    })

    if (userResult.error) {
      console.error(
        'Failed to find or create user from OAuth:',
        userResult.error,
      )
      return new Response('Failed to process user information', { status: 500 })
    }

    const { user, workspace } = userResult.value

    // 4. Create session
    await setSession(
      {
        sessionData: {
          user,
          workspace,
        },
      },
      cookiesStore,
    )

    // 5. Redirect user
    const returnTo = cookiesStore.get('returnTo')?.value ?? env.APP_URL
    return NextResponse.redirect(returnTo)
  } catch (e) {
    console.error('Google OAuth Callback Error:', e)
    if (e instanceof OAuth2RequestError) {
      return new Response('Invalid OAuth code', { status: 400 })
    }
    return new Response('Internal Server Error', { status: 500 })
  }
}
