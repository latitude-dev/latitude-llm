import { findIntegrationById } from '../../../queries/integrations/findById'
import { IntegrationType } from '@latitude-data/constants'
import { getMcpOAuthCredentials, McpOAuthProvider } from './oauthProvider'
import { Result, TypedResult } from '../../../lib/Result'
import {
  LatitudeError,
  BadRequestError,
  NotFoundError,
} from '../../../lib/errors'
import { env } from '@latitude-data/env'
import { API_ROUTES } from '../../../constants'
import {
  discoverOAuthMetadata,
  discoverOAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/sdk/client/auth.js'
import { OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js'
import { database } from '../../../client'
import { integrations } from '../../../schema/models/integrations'
import { eq } from 'drizzle-orm'
import {
  ExternalMcpIntegrationConfiguration,
  OAuthStatus,
} from '../helpers/schema'

type OAuthCallbackParams = {
  code: string
  state: string
}

/**
 * Builds a URL by appending a path segment to an existing URL's path.
 * Unlike `new URL("/path", baseUrl)` which replaces the path, this appends to it.
 * This is needed for servers that use path-based routing.
 */
function buildPathBasedUrl(baseUrl: URL, pathSegment: string): URL {
  const basePath = baseUrl.pathname.replace(/\/$/, '')
  return new URL(`${basePath}/${pathSegment}`, baseUrl.origin)
}

/**
 * Custom token exchange that handles path-based authorization servers.
 * The MCP SDK's exchangeAuthorization uses `new URL("/token", baseUrl)` which
 * replaces the path. Some servers use path-based routing where the token
 * endpoint is at `baseUrl/token` not `/token`.
 */
async function exchangeAuthorizationWithPathSupport(
  authorizationServerUrl: URL,
  {
    metadata,
    clientInformation,
    authorizationCode,
    codeVerifier,
    redirectUri,
  }: {
    metadata: OAuthMetadata | undefined
    clientInformation: { client_id: string; client_secret?: string }
    authorizationCode: string
    codeVerifier: string
    redirectUri: string
  },
) {
  let tokenUrl: URL

  if (metadata?.token_endpoint) {
    tokenUrl = new URL(metadata.token_endpoint)
  } else {
    tokenUrl = buildPathBasedUrl(authorizationServerUrl, 'token')
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientInformation.client_id,
    code: authorizationCode,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  })

  if (clientInformation.client_secret) {
    params.set('client_secret', clientInformation.client_secret)
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed: HTTP ${response.status}`)
  }

  return OAuthTokensSchema.parse(await response.json())
}

/**
 * Handles the OAuth callback for MCP server authentication.
 * Exchanges the authorization code for access tokens and stores them.
 *
 * This follows the same discovery flow as initiateOAuthRegistration:
 * 1. Discover protected resource metadata to find the authorization server
 * 2. Exchange the authorization code for tokens using the auth() function
 */
export async function handleOAuthCallback(
  params: OAuthCallbackParams,
): Promise<TypedResult<void, LatitudeError>> {
  const { code, state } = params

  let stateData: { integrationId: number; workspaceId: number }
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
  } catch {
    return Result.error(new BadRequestError('Invalid state parameter'))
  }

  const { integrationId, workspaceId } = stateData

  let integration
  try {
    integration = await findIntegrationById({ workspaceId, id: integrationId })
  } catch (e) {
    if (e instanceof NotFoundError) {
      return Result.error(new NotFoundError('Integration not found'))
    }
    throw e
  }

  if (integration.type !== IntegrationType.ExternalMCP) {
    return Result.error(
      new BadRequestError('Integration does not support OAuth'),
    )
  }

  const credentials = await getMcpOAuthCredentials(workspaceId, integrationId)
  if (!credentials) {
    return Result.error(
      new BadRequestError(
        'No OAuth credentials found. The OAuth flow may not have been initiated properly.',
      ),
    )
  }

  const url = integration.configuration.url
  const urlWithProtocol = url.match(/^https?:\/\//) ? url : `https://${url}`
  const serverUrl = new URL(urlWithProtocol)

  const redirectUrl = `${env.APP_URL}${API_ROUTES.integrations.oauth.callback}`
  const oauthProvider = new McpOAuthProvider({
    redirectUrl,
    integration,
    credentials,
  })

  try {
    let authorizationServerUrl: URL = serverUrl
    let resourceMetadataUrl: URL | undefined

    // Step 1: Discover the resource metadata URL from the server's WWW-Authenticate header
    try {
      const probeResponse = await fetch(serverUrl, { method: 'GET' })
      if (probeResponse.status === 401) {
        const wwwAuth = probeResponse.headers.get('WWW-Authenticate')
        if (wwwAuth) {
          const match = /resource_metadata="([^"]*)"/.exec(wwwAuth)
          if (match) {
            resourceMetadataUrl = new URL(match[1])
          }
        }
      }
    } catch {
      // Ignore probe errors
    }

    // Step 2: Discover protected resource metadata to find the authorization server
    try {
      const resourceMetadata = await discoverOAuthProtectedResourceMetadata(
        serverUrl,
        { resourceMetadataUrl },
      )
      if (
        resourceMetadata.authorization_servers &&
        resourceMetadata.authorization_servers.length > 0
      ) {
        authorizationServerUrl = new URL(
          resourceMetadata.authorization_servers[0]!,
        )
      }
    } catch {
      // Protected resource metadata not available, continue with server URL as auth server
    }

    // Step 3: Discover authorization server metadata (optional)
    const metadata = await discoverOAuthMetadata(authorizationServerUrl)

    // Step 4: Get client information and code verifier
    const clientInformation = oauthProvider.clientInformation()
    if (!clientInformation) {
      return Result.error(
        new LatitudeError(
          'No client information found. The OAuth flow may not have been initiated properly.',
        ),
      )
    }

    const codeVerifier = await oauthProvider.codeVerifier()

    // Step 5: Exchange authorization code for tokens using our path-aware function
    const tokens = await exchangeAuthorizationWithPathSupport(
      authorizationServerUrl,
      {
        metadata,
        clientInformation,
        authorizationCode: code,
        codeVerifier,
        redirectUri: redirectUrl,
      },
    )

    // Step 6: Save tokens and update integration status in a transaction
    await database.transaction(async (tx) => {
      // @ts-expect-error - tx is a PgTransaction which duck-types with Database
      await oauthProvider.saveTokens(tokens, tx)

      const updatedConfiguration: ExternalMcpIntegrationConfiguration = {
        ...integration.configuration,
        oauthStatus: OAuthStatus.completed,
      }
      await tx
        .update(integrations)
        .set({ configuration: updatedConfiguration })
        .where(eq(integrations.id, integration.id))
    })

    return Result.ok(undefined)
  } catch (err) {
    const baseMessage =
      err instanceof Error
        ? err.message
        : 'Unknown error during OAuth token exchange'
    const errorMessage = `Failed to complete OAuth authentication for MCP server at ${serverUrl.host}: ${baseMessage}`
    return Result.error(new LatitudeError(errorMessage))
  }
}
