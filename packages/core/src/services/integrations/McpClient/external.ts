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

  const transportResult = createMcpTransport(integration.configuration.url)
  if (!Result.isOk(transportResult)) {
    return Result.error(new McpConnectionError(transportResult.error.message))
  }
  const transport = transportResult.unwrap()
  const client = new McpClient({
    name: integration.name,
    version: '1.0.0',
  })

  const connectResult = await retryWithBackoff(async () => {
    console.log('connecting to MCP', transport)
    await client.connect(transport)
    return { client, transport }
  })

  if (!Result.isOk(connectResult)) {
    return Result.error(connectResult.error)
  }

  return Result.ok(connectResult.value)
}
