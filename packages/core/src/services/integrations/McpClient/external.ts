import { IntegrationType } from '@latitude-data/constants'
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { IntegrationDto } from '../../../browser'
import { Result, TypedResult } from '../../../lib/Result'
import {
  McpClientConnection,
  McpConnectionError,
  normalizeMcpUrl,
  retryWithBackoff,
} from './utils'

export async function createAndConnectExternalMcpClient(
  integration: IntegrationDto,
): Promise<TypedResult<McpClientConnection, McpConnectionError>> {
  if (integration.type !== IntegrationType.ExternalMCP) {
    return Result.error(
      new McpConnectionError(
        `Integration type ${integration.type} is not supported for external MCP client`,
      ),
    )
  }

  const urlResult = normalizeMcpUrl(integration.configuration.url)
  if (!Result.isOk(urlResult)) {
    return Result.error(new McpConnectionError(urlResult.error.message))
  }

  const client = new McpClient({
    name: integration.name,
    version: '1.0.0',
  })

  const connectResult = await retryWithBackoff(async () => {
    const transport = new SSEClientTransport(urlResult.value)
    await client.connect(transport)
    return { client, transport }
  })

  if (!Result.isOk(connectResult)) {
    return Result.error(connectResult.error)
  }

  return Result.ok(connectResult.value)
}
