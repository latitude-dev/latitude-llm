import { Result, TypedResult } from '../../lib/Result'
import { mcpServers } from '../../schema/models/mcpServers'
import { database } from '../../client'
import { Transaction } from '../../lib'
import { eq } from 'drizzle-orm'
import { McpServer } from '../../browser'

/**
 * Updates the lastUsedAt timestamp of an MCP server to the current time
 *
 * @param mcpServer - The MCP server to update
 * @param db - Optional database instance for transactions
 * @returns Result with the updated MCP server or an error
 */
export async function updateMcpServerLastUsed(
  mcpServer: McpServer,
  db = database,
): Promise<TypedResult<McpServer, Error>> {
  return Transaction.call(async (tx) => {
    const updatedRecords = await tx
      .update(mcpServers)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(mcpServers.id, mcpServer.id))
      .returning()

    if (!updatedRecords[0]) {
      return Result.error(
        new Error(`MCP Server with ID ${mcpServer.id} not found`),
      )
    }

    return Result.ok(updatedRecords[0])
  }, db)
}
