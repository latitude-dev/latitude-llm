import { NextRequest, NextResponse } from 'next/server'
import { handleOAuthCallback } from '@latitude-data/core/services/integrations/McpClient/oauthCallback'
import { ROUTES } from '$/services/routes'
import { errorHandler } from '$/middlewares/errorHandler'

/**
 * OAuth callback handler for MCP server authentication.
 * This endpoint receives the authorization code from the OAuth provider
 * and exchanges it for access tokens.
 */
export const GET = errorHandler(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    const errorDescription = searchParams.get('error_description') ?? error
    return NextResponse.redirect(
      new URL(
        `${ROUTES.settings.root}?error=${encodeURIComponent(errorDescription)}`,
        request.url,
      ),
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(
        `${ROUTES.settings.root}?error=${encodeURIComponent('Missing authorization code or state')}`,
        request.url,
      ),
    )
  }

  const result = await handleOAuthCallback({ code, state })

  if (!result.ok) {
    const errorMessage = result.error?.message ?? 'Unknown error during OAuth'
    return NextResponse.redirect(
      new URL(
        `${ROUTES.settings.root}?error=${encodeURIComponent(errorMessage)}`,
        request.url,
      ),
    )
  }

  return NextResponse.redirect(
    new URL(
      `${ROUTES.settings.root}?success=${encodeURIComponent('OAuth authentication completed successfully')}`,
      request.url,
    ),
  )
})
