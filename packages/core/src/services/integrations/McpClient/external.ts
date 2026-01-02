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
import {
  McpOAuthProvider,
  getMcpOAuthCredentials,
} from './oauthProvider'
import { env } from '@latitude-data/env'

type OAuthCallbacks = {
  onRedirectToAuthorization?: (authorizationUrl: URL) => void
}

export async function createAndConnectExternalMcpClient(
  integration: IntegrationDto,
  oauthCallbacks?: OAuthCallbacks,
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
    const credentials = await getMcpOAuthCredentials(integration.id)
    const redirectUrl = `${env.APP_URL}/api/integrations/oauth/callback`
    oauthProvider = new McpOAuthProvider({
      redirectUrl,
      integration,
      credentials,
      onRedirectToAuthorization: oauthCallbacks?.onRedirectToAuthorization,
    })
  }

  const transportResult = createMcpTransport(
    integration.configuration.url,
    oauthProvider,
  )
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
