import { eq } from 'drizzle-orm'

import { IntegrationType } from '@latitude-data/constants'
import { ForbiddenError } from '@latitude-data/constants/errors'
import { IntegrationDto, McpServer } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { McpServerRepository } from '../../repositories'
import { integrations } from '../../schema'
import { destroyMcpServer } from '../mcpServers/destroyService'
import { destroyPipedreamAccountFromIntegration } from './pipedream/destroy'
import { listReferences } from './references'

export async function destroyIntegration(
  integration: IntegrationDto,
  transaction = new Transaction(),
) {
  return transaction.call(async (trx) => {
    const referencesResult = await listReferences(integration, trx)
    if (!Result.isOk(referencesResult)) {
      return referencesResult
    }
    const references = referencesResult.unwrap()
    if (references.length > 0) {
      return Result.error(
        new ForbiddenError(
          `Cannot delete integration ${integration.name} because it has ${references.length} references.`,
        ),
      )
    }

    // If integration type is MCPServer, first destroy the associated MCP server
    let mcpServer: McpServer | null = null
    if (
      integration.type === IntegrationType.HostedMCP &&
      integration.mcpServerId
    ) {
      // Get the MCP server
      const mcpServerRepo = new McpServerRepository(
        integration.workspaceId,
        trx,
      )
      mcpServer = await mcpServerRepo
        .find(integration.mcpServerId)
        .then((r) => r.unwrap())
    }

    // Destroy Hosted MCP
    if (mcpServer) await destroyMcpServer(mcpServer, transaction)

    // Remove user's account from Pipedream
    await destroyPipedreamAccountFromIntegration(integration).then((r) =>
      r.unwrap(),
    )

    await trx.delete(integrations).where(eq(integrations.id, integration.id))
    return Result.ok(integration)
  })
}
