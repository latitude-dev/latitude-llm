import { IntegrationType } from '@latitude-data/constants'
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import { IntegrationDto } from '../../../schema/models/types/Integration'
import { Result, TypedResult } from '../../../lib/Result'
import { createAndConnectExternalMcpClient } from './external'
import {
  McpClientConnection,
  McpClientTransport,
  McpConnectionError,
} from './utils'

export type McpClientOptions = {
  runtimeHeaders?: Record<string, string>
}

// Public Types
export interface McpClientManager {
  getClient: (
    integration: IntegrationDto,
    options?: McpClientOptions,
  ) => Promise<TypedResult<McpClient, McpConnectionError>>
  closeClient: (integration: IntegrationDto) => void
  closeAllClients: () => void
}

// Public Functions
export async function getMcpClient(
  integration: IntegrationDto,
): Promise<TypedResult<McpClient, McpConnectionError>> {
  const result = await createAndConnectClient(integration)
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
    options?: McpClientOptions,
  ): Promise<TypedResult<McpClient, McpConnectionError>> => {
    const key = getClientKey(integration)
    const hasRuntimeHeaders =
      options?.runtimeHeaders && Object.keys(options.runtimeHeaders).length > 0

    // When runtime headers are provided, always create a fresh connection
    // to ensure the correct headers are used for this request
    if (!hasRuntimeHeaders && clientMap.has(key)) {
      return Result.ok(clientMap.get(key)!)
    }

    // Create new client with optional runtime headers
    const result = await createAndConnectClient(integration, options)
    if (!Result.isOk(result)) return result

    const { client, transport } = result.value

    // Only cache if no runtime headers (otherwise each request may need different headers)
    if (!hasRuntimeHeaders) {
      clientMap.set(key, client)
      transportMap.set(key, transport)
    }

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
  options?: McpClientOptions,
): Promise<TypedResult<McpClientConnection, McpConnectionError>> {
  // @ts-expect-error - HostedMCP is deprecated but still present in the DB enum
  if (integration.type === IntegrationType.HostedMCP) {
    return Result.error(
      new McpConnectionError(
        `Integration type ${IntegrationType.HostedMCP} is deprecated. Please migrate to ExternalMCP.`,
      ),
    )
  }

  if (integration.type === IntegrationType.ExternalMCP) {
    return createAndConnectExternalMcpClient(integration, {
      runtimeHeaders: options?.runtimeHeaders,
    })
  }

  return Result.error(
    new McpConnectionError(
      `Integration type ${integration.type} is not supported for MCP client`,
    ),
  )
}
