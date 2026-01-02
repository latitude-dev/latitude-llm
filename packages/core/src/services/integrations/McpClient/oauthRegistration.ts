import { IntegrationDto } from '../../../schema/models/types/Integration'
import { IntegrationType } from '@latitude-data/constants'
import { Result, TypedResult } from '../../../lib/Result'
import { LatitudeError, BadRequestError } from '../../../lib/errors'
import { env } from '@latitude-data/env'
import { API_ROUTES } from '../../../constants'
import { McpOAuthProvider } from './oauthProvider'
import {
  discoverOAuthMetadata,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js'

type InitiateOAuthParams = {
  integration: IntegrationDto
  authorId: string
}

/**
 * Initiates OAuth dynamic client registration for an external MCP integration.
 * This should be called when creating an integration with OAuth enabled.
 * Returns the authorization URL that the user should be redirected to.
 */
export async function initiateOAuthRegistration(
  params: InitiateOAuthParams,
): Promise<TypedResult<string, LatitudeError>> {
  const { integration, authorId } = params

  if (integration.type !== IntegrationType.ExternalMCP) {
    return Result.error(
      new BadRequestError('Integration type does not support OAuth'),
    )
  }

  const url = integration.configuration.url
  const urlWithProtocol = url.match(/^https?:\/\//) ? url : `https://${url}`
  const serverUrl = new URL(urlWithProtocol)

  const redirectUrl = `${env.APP_URL}${API_ROUTES.integrations.oauth.callback}`
  const oauthProvider = new McpOAuthProvider({
    redirectUrl,
    integration,
    credentials: null,
    authorId,
  })

  try {
    const metadata = await discoverOAuthMetadata(serverUrl)

    if (!metadata) {
      return Result.error(
        new LatitudeError(
          `MCP server at ${serverUrl.host} does not support OAuth. No OAuth metadata found.`,
        ),
      )
    }

    const { authorizationUrl } = await startAuthorization(serverUrl, {
      metadata,
      clientInformation: oauthProvider.clientInformation(),
      redirectUrl,
      scope: oauthProvider.clientMetadata.scope,
    })

    await oauthProvider.saveCodeVerifier(
      authorizationUrl.searchParams.get('code_challenge') ?? '',
    )

    const state = oauthProvider.state()
    authorizationUrl.searchParams.set('state', state)

    return Result.ok(authorizationUrl.toString())
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to initiate OAuth'
    return Result.error(
      new LatitudeError(
        `Failed to initiate OAuth registration for MCP server at ${serverUrl.host}: ${message}`,
      ),
    )
  }
}
