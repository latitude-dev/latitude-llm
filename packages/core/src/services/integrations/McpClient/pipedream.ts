import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { IntegrationDto } from '../../../browser'
import {
  McpConnectionError,
  McpClientConnection,
  retryWithBackoff,
  PIPEDREAM_MCP_URL,
} from './utils'
import { Result } from '../../../lib/Result'
import { TypedResult } from '../../../lib/Result'
import { IntegrationType } from '@latitude-data/constants'
import { getPipedreamEnvironment } from '../pipedream/apps'
import { createBackendClient } from '@pipedream/sdk'

export async function createAndConnectPipedreamMcpClient(
  integration: IntegrationDto,
): Promise<TypedResult<McpClientConnection, McpConnectionError>> {
  if (integration.type !== IntegrationType.Pipedream) {
    return Result.error(
      new McpConnectionError(
        `Integration type ${integration.type} is not supported for Pipedream MCP client`,
      ),
    )
  }

  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(new McpConnectionError(pipedreamEnv.error!.message))
  }
  const pipedream = createBackendClient(pipedreamEnv.unwrap())
  const { environment: pipedreamEnvironment, projectId: pipedreamProjectId } =
    pipedreamEnv.unwrap()

  const accessToken = await pipedream.rawAccessToken()
  const serverUrl = PIPEDREAM_MCP_URL

  const client = new McpClient({
    name: integration.name,
    version: '1.0.0',
  })
  const connectResult = await retryWithBackoff(async () => {
    // https://pipedream.com/docs/connect/mcp/developers/#params
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-pd-project-id': pipedreamProjectId,
          'x-pd-environment': pipedreamEnvironment,
          // Each account has a unique external user ID, even if it belongs to the same Workspace.
          // This is because Pipedream only scopes accounts by user ID and app ID, but Pipedream allows to add
          // multiple accounts of the same app in the same user, but they do not allow scoping to a specific one.
          'x-pd-external-user-id': integration.configuration.externalUserId,
          'x-pd-app-slug': integration.configuration.appName,
          'x-pd-tool-mode': 'tools-only',
        },
      },
    })

    await client.connect(transport)

    return { client, transport }
  })

  if (!Result.isOk(connectResult)) {
    return Result.error(connectResult.error)
  }

  return Result.ok(connectResult.value)
}
