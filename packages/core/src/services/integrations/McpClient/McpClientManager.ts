import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { IntegrationDto } from '../../../browser'
import {
  McpConnectionError,
  McpClientConnection,
  McpClientTransport,
} from './utils'
import { ChainStreamManager } from '../../../lib/chainStreamManager'
import { Result } from './../../../lib/Result'
import { TypedResult } from './../../../lib/Result'
import { IntegrationType } from '@latitude-data/constants'
import { createAndConnectHostedMcpClient } from './hosted'
import { createAndConnectExternalMcpClient } from './external'
import { createAndConnectPipedreamMcpClient } from './pipedream'

// Public Types
export interface McpClientManager {
  getClient: (
    integration: IntegrationDto,
    chainStreamManager?: ChainStreamManager,
  ) => Promise<TypedResult<McpClient, McpConnectionError>>
  closeClient: (integration: IntegrationDto) => void
  closeAllClients: () => void
}

// Public Functions
export async function getMcpClient(
  integration: IntegrationDto,
  chainStreamManager?: ChainStreamManager,
): Promise<TypedResult<McpClient, McpConnectionError>> {
  const result = await createAndConnectClient(integration, chainStreamManager)
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
    chainStreamManager?: ChainStreamManager,
  ): Promise<TypedResult<McpClient, McpConnectionError>> => {
    const key = getClientKey(integration)

    // Return cached client if exists
    if (clientMap.has(key)) {
      return Result.ok(clientMap.get(key)!)
    }

    // Create new client
    const result = await createAndConnectClient(integration, chainStreamManager)
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
  chainStreamManager?: ChainStreamManager,
): Promise<TypedResult<McpClientConnection, McpConnectionError>> {
  if (integration.type === IntegrationType.HostedMCP) {
    return createAndConnectHostedMcpClient(integration, chainStreamManager)
  }

  if (integration.type === IntegrationType.ExternalMCP) {
    return createAndConnectExternalMcpClient(integration)
  }

  if (integration.type === IntegrationType.Pipedream) {
    return createAndConnectPipedreamMcpClient(integration)
  }

  return Result.error(
    new McpConnectionError(
      `Integration type ${integration.type} is not supported for MCP client`,
    ),
  )
}
