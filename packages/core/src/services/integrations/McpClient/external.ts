import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { IntegrationDto } from '../../../browser'
import {
  McpConnectionError,
  type McpClientConnection,
  normalizeMcpUrl,
  retryWithBackoff,
} from './utils'
import { Result } from '../../../lib/Result'
import type { TypedResult } from '../../../lib/Result'
import { IntegrationType } from '@latitude-data/constants'

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
