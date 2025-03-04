import { eq } from 'drizzle-orm'

import { IntegrationDto, McpServer } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { integrations } from '../../schema'
import { IntegrationType } from '@latitude-data/constants'
import { destroyMcpServer } from '../mcpServers/destroyService'
import { McpServerRepository } from '../../repositories'

export async function destroyIntegration(
  integration: IntegrationDto,
  db = database,
) {
  // If integration type is MCPServer, first destroy the associated MCP server
  let mcpServer: McpServer | null = null
  if (
    integration.type === IntegrationType.HostedMCP &&
    integration.mcpServerId
  ) {
    // Get the MCP server
    const mcpServerRepo = new McpServerRepository(integration.workspaceId, db)
    mcpServer = await mcpServerRepo
      .find(integration.mcpServerId)
      .then((r) => r.unwrap())
  }

  return Transaction.call(async (trx) => {
    if (mcpServer) await destroyMcpServer(mcpServer, trx)
    await trx.delete(integrations).where(eq(integrations.id, integration.id))

    return Result.ok(integration)
  }, db)
}
