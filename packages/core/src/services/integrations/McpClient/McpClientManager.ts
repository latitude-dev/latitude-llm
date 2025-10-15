import { IntegrationType } from '@latitude-data/constants'
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { IntegrationDto } from '../../../schema/models/types/Integration'
import { Result, TypedResult } from '../../../lib/Result'
import { StreamManager } from '../../../lib/streamManager'
import { createAndConnectExternalMcpClient } from './external'
import { createAndConnectHostedMcpClient } from './hosted'
import {
  McpClientConnection,
  McpClientTransport,
  McpConnectionError,
} from './utils'

// Public Types
export interface McpClientManager {
  getClient: (
    integration: IntegrationDto,
    streamManager?: StreamManager,
  ) => Promise<TypedResult<McpClient, McpConnectionError>>
  closeClient: (integration: IntegrationDto) => void
  closeAllClients: () => void
}

// Public Functions
export async function getMcpClient(
  integration: IntegrationDto,
  streamManager?: StreamManager,
): Promise<TypedResult<McpClient, McpConnectionError>> {
  const result = await createAndConnectClient(integration, streamManager)
  if (!Result.isOk(result)) return result
  return Result.ok(result.value.client)
}

export const createMcpClientManager = (): McpClientManager => {
  const clientMap = new Map<string, McpClient>()
  const transportMap = new Map<string, McpClientTransport>()

  const getClientKey = (integration: IntegrationDto): string =>
    `${integration.workspaceId}:${integration.id}`

  const getClient = async (
    integration: IntegrationDto,
    streamManager?: StreamManager,
  ): Promise<TypedResult<McpClient, McpConnectionError>> => {
    const key = getClientKey(integration)

    // Return cached client if exists
    if (clientMap.has(key)) {
      return Result.ok(clientMap.get(key)!)
    }

    // Create new client
    const result = await createAndConnectClient(integration, streamManager)
    if (!Result.isOk(result)) return result

    const { client, transport } = result.value

    // Cache the client and transport
    clientMap.set(key, client)
    transportMap.set(key, transport)

    return Result.ok(client)
  }

  const closeClient = (integration: IntegrationDto): void => {
    const key = getClientKey(integration)
    const transport = transportMap.get(key)

    if (transport) {
      transport.close()
      clientMap.delete(key)
      transportMap.delete(key)
    }
  }

  const closeAllClients = (): void => {
    for (const transport of transportMap.values()) {
      try {
        transport.close()
      } catch (error) {
        console.error('Error closing transport:', error)
      }
    }

    clientMap.clear()
    transportMap.clear()
  }

  return {
    getClient,
    closeClient,
    closeAllClients,
  }
}

async function createAndConnectClient(
  integration: IntegrationDto,
  streamManager?: StreamManager,
): Promise<TypedResult<McpClientConnection, McpConnectionError>> {
  if (integration.type === IntegrationType.HostedMCP) {
    return createAndConnectHostedMcpClient(integration, streamManager)
  }

  if (integration.type === IntegrationType.ExternalMCP) {
    return createAndConnectExternalMcpClient(integration)
  }

  return Result.error(
    new McpConnectionError(
      `Integration type ${integration.type} is not supported for MCP client`,
    ),
  )
}
