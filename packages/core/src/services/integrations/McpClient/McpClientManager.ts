import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { IntegrationDto, McpServer } from '../../../browser'
import { McpServerRepository } from '../../../repositories'
import { scaleMcpServer } from '../../mcpServers/scaleService'
import {
  McpConnectionError,
  McpClientConnection,
  normalizeMcpUrl,
  retryWithBackoff,
  DEFAULT_RETRY_CONFIG,
} from './utils'
import { publisher } from '../../../events/publisher'
import { ChainStreamManager } from '../../../lib/chainStreamManager'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { maintenanceQueue } from '../../../jobs/queues'
import { Result } from './../../../lib/Result'
import { TypedResult } from './../../../lib/Result'

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
  const transportMap = new Map<string, SSEClientTransport>()

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

// Private Core Functions
async function ensureMcpServerScaled(
  integration: IntegrationDto,
  chainStreamManager?: ChainStreamManager,
): Promise<TypedResult<McpServer | undefined, McpConnectionError>> {
  if (!integration.mcpServerId) return Result.nil()

  const mcpServerRepo = new McpServerRepository(integration.workspaceId)
  const mcpServerResult = await mcpServerRepo.find(integration.mcpServerId)

  if (!Result.isOk(mcpServerResult)) {
    return Result.error(
      new McpConnectionError(
        `Failed to find MCP server: ${mcpServerResult.error.message}`,
      ),
    )
  }

  const mcpServer = mcpServerResult.value
  if (mcpServer.replicas === 0) {
    chainStreamManager?.wakingIntegration(integration)
    const scaleResult = await scaleMcpServer({
      mcpServer,
      replicas: 1,
    })

    if (!Result.isOk(scaleResult)) {
      chainStreamManager?.error(
        new ChainError({
          message: `Failed to scale up integration: ${integration.name}. Please try again or contact support.`,
          code: RunErrorCodes.FailedToWakeUpIntegrationError,
        }),
      )

      return Result.error(
        new McpConnectionError(
          `Failed to scale up MCP server: ${scaleResult.error.message}`,
        ),
      )
    }

    return scaleResult
  }

  return Result.nil()
}

async function updateMcpServerLastUsed(
  integration: IntegrationDto,
): Promise<TypedResult<void, McpConnectionError>> {
  if (!integration.mcpServerId) return Result.ok(undefined)

  const mcpServerRepo = new McpServerRepository(integration.workspaceId)
  const mcpServerResult = await mcpServerRepo.find(integration.mcpServerId)

  if (!Result.isOk(mcpServerResult)) {
    return Result.error(
      new McpConnectionError(
        `Failed to find MCP server: ${mcpServerResult.error.message}`,
      ),
    )
  }

  try {
    await maintenanceQueue.add('updateMcpServerLastUsedJob', {
      workspaceId: integration.workspaceId,
      mcpServerId: mcpServerResult.value.id,
    })
    return Result.ok(undefined)
  } catch (error) {
    return Result.error(
      new McpConnectionError(
        `Failed to update MCP server last used: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}

// Private Core Function
async function createAndConnectClient(
  integration: IntegrationDto,
  chainStreamManager?: ChainStreamManager,
): Promise<TypedResult<McpClientConnection, McpConnectionError>> {
  const { configuration } = integration
  if (!configuration?.url) {
    return Result.error(
      new McpConnectionError(
        'MCP server URL not found in integration configuration',
      ),
    )
  }

  const urlResult = normalizeMcpUrl(configuration.url)
  if (!Result.isOk(urlResult)) {
    return Result.error(new McpConnectionError(urlResult.error.message))
  }

  // Ensure MCP server is scaled up if needed
  const scaleResult = await ensureMcpServerScaled(
    integration,
    chainStreamManager,
  )
  if (!Result.isOk(scaleResult)) {
    return Result.error(scaleResult.error)
  }

  const client = new McpClient({
    name: integration.name,
    version: '1.0.0',
  })

  const GRACE_PERIOD = 10000 // 10 seconds
  const connectResult = await retryWithBackoff(
    async () => {
      const transport = new SSEClientTransport(urlResult.value)
      await client.connect(transport)
      return { client, transport }
    },
    {
      ...DEFAULT_RETRY_CONFIG,
      startupTimeout:
        scaleResult.value !== undefined ? GRACE_PERIOD : undefined, // 10 second startup timeout if server was scaled up
    },
  )

  if (!Result.isOk(connectResult)) {
    return Result.error(connectResult.error)
  }

  if (scaleResult.value !== undefined) {
    publisher.publishLater({
      type: 'mcpServerConnected',
      data: {
        workspaceId: integration.workspaceId,
        mcpServerId: integration.mcpServerId!,
      },
    })
  }

  // Update last used timestamp
  const updateResult = await updateMcpServerLastUsed(integration)
  if (!Result.isOk(updateResult)) return updateResult

  return Result.ok(connectResult.value)
}
