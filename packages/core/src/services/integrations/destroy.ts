import { eq } from 'drizzle-orm'

import { IntegrationDto, McpServer } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { integrations } from '../../schema'
import { IntegrationType } from '@latitude-data/constants'
import { destroyMcpServer } from '../mcpServers/destroyService'
import { McpServerRepository } from '../../repositories'
import { destroyPipedreamAccountFromIntegration } from './pipedream/destroy'

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
    // Destroy Hosted MCP
    if (mcpServer) await destroyMcpServer(mcpServer, trx)

    // Remove user's account from Pipedream
    await destroyPipedreamAccountFromIntegration(integration).then((r) =>
      r.unwrap(),
    )

    await trx.delete(integrations).where(eq(integrations.id, integration.id))
    return Result.ok(integration)
  }, db)
}
