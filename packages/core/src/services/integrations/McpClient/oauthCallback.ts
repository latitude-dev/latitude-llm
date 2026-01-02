import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
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

type OAuthCallbackParams = {
  code: string
  state: string
}

/**
 * Handles the OAuth callback for MCP server authentication.
 * Exchanges the authorization code for access tokens and stores them.
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

  const credentials = await getMcpOAuthCredentials(integrationId)

  const redirectUrl = `${env.APP_URL}/api/integrations/oauth/callback`
  const oauthProvider = new McpOAuthProvider({
    redirectUrl,
    integration,
    credentials,
  })

  const url = integration.configuration.url
  const urlWithProtocol = url.match(/^https?:\/\//) ? url : `http://${url}`
  const urlObject = new URL(urlWithProtocol)
  const isSSE = urlObject.pathname.endsWith('/sse')

  try {
    const transport = isSSE
      ? new SSEClientTransport(urlObject, { authProvider: oauthProvider })
      : new StreamableHTTPClientTransport(urlObject, {
          authProvider: oauthProvider,
        })

    await transport.finishAuth(code)

    return Result.ok(undefined)
  } catch (err) {
    const baseMessage =
      err instanceof Error
        ? err.message
        : 'Unknown error during OAuth token exchange'
    const errorMessage = `Failed to complete OAuth authentication for MCP server at ${urlObject.host}: ${baseMessage}`
    return Result.error(new LatitudeError(errorMessage))
  }
}
