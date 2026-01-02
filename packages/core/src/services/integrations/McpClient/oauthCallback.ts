import { IntegrationsRepository } from '../../../repositories'
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
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
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

  const integrationsRepo = new IntegrationsRepository(workspaceId)
  const integrationResult = await integrationsRepo.find(integrationId)

  if (!integrationResult.ok) {
    return Result.error(new NotFoundError('Integration not found'))
  }

  const integration = integrationResult.value
  if (!integration) {
    return Result.error(new NotFoundError('Integration not found'))
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
    // Discover the resource metadata URL from the server's WWW-Authenticate header
    let resourceMetadataUrl: URL | undefined
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

    // Use the MCP SDK's auth function to complete the OAuth flow
    // This handles discovering the authorization server and exchanging the code for tokens
    const result = await auth(oauthProvider, {
      serverUrl,
      authorizationCode: code,
      resourceMetadataUrl,
    })

    if (result !== 'AUTHORIZED') {
      return Result.error(
        new LatitudeError(
          `OAuth authorization failed for MCP server at ${serverUrl.host}`,
        ),
      )
    }

    // Update the integration's OAuth status to completed
    const updatedConfiguration: ExternalMcpIntegrationConfiguration = {
      ...integration.configuration,
      oauthStatus: OAuthStatus.completed,
    }
    await database
      .update(integrations)
      .set({ configuration: updatedConfiguration })
      .where(eq(integrations.id, integration.id))

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
