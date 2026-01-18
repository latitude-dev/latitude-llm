import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { IntegrationDto } from '../../../schema/models/types/Integration'
import {
  McpConnectionError,
  McpClientConnection,
  createMcpTransport,
  retryWithBackoff,
} from './utils'
import { Result } from '../../../lib/Result'
import { TypedResult } from '../../../lib/Result'
import { IntegrationType } from '@latitude-data/constants'
import { McpOAuthProvider, getMcpOAuthCredentials } from './oauthProvider'
import { env } from '@latitude-data/env'
import { API_ROUTES } from '../../../constants'

type OAuthCallbacks = {
  onRedirectToAuthorization?: (authorizationUrl: URL) => void
}

type ExternalMcpClientOptions = {
  oauthCallbacks?: OAuthCallbacks
  authorId?: string
  runtimeHeaders?: Record<string, string>
}

export async function createAndConnectExternalMcpClient(
  integration: IntegrationDto,
  options?: ExternalMcpClientOptions,
): Promise<TypedResult<McpClientConnection, McpConnectionError>> {
  if (integration.type !== IntegrationType.ExternalMCP) {
    return Result.error(
      new McpConnectionError(
        `Integration type ${integration.type} is not supported for external MCP client`,
      ),
    )
  }

  const useOAuth = integration.configuration.useOAuth ?? false
  let oauthProvider: McpOAuthProvider | undefined

  if (useOAuth) {
    const credentials = await getMcpOAuthCredentials(
      integration.workspaceId,
      integration.id,
    )
    const redirectUrl = `${env.APP_URL}${API_ROUTES.integrations.oauth.callback}`
    oauthProvider = new McpOAuthProvider({
      redirectUrl,
      integration,
      credentials,
      authorId: options?.authorId,
      onRedirectToAuthorization:
        options?.oauthCallbacks?.onRedirectToAuthorization,
    })
  }

  // Merge static integration headers with runtime headers
  // Runtime headers take precedence over static headers
  const mergedHeaders =
    integration.configuration.headers || options?.runtimeHeaders
      ? {
          ...integration.configuration.headers,
          ...options?.runtimeHeaders,
        }
      : undefined

  const transportResult = createMcpTransport(integration.configuration.url, {
    authProvider: oauthProvider,
    headers: mergedHeaders,
  })
  if (!Result.isOk(transportResult)) {
    return Result.error(new McpConnectionError(transportResult.error.message))
  }
  const transport = transportResult.unwrap()
  const client = new McpClient({
    name: integration.name,
    version: '1.0.0',
  })

  const connectResult = await retryWithBackoff(async () => {
    await client.connect(transport)
    return { client, transport }
  })

  if (!Result.isOk(connectResult)) {
    return Result.error(connectResult.error)
  }

  return Result.ok(connectResult.value)
}
