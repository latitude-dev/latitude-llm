import type { Job } from 'bullmq'
import { database } from '../../../client'
import { mcpServers } from '../../../schema/models/mcpServers'
import { eq } from 'drizzle-orm'
import { scaleMcpServer } from '../../../services/mcpServers/scaleService'
import { Result } from '../../../lib/Result'

export type ScaleDownMcpServerJobData = {
  mcpServerId: number
}

/**
 * Job that scales down a single MCP server to 0 replicas
 *
 * This job:
 * 1. Fetches the MCP server from the database
 * 2. Scales it down to 0 replicas
 */
export const scaleDownMcpServerJob = async (job: Job<ScaleDownMcpServerJobData>) => {
  const { mcpServerId } = job.data

  try {
    // Fetch the MCP server from the database
    const server = await database
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, mcpServerId))
      .then((rows) => rows[0])

    if (!server) {
      throw new Error(`MCP server with ID ${mcpServerId} not found`)
    }

    // Scale down the server
    const result = await scaleMcpServer({
      mcpServer: server,
      replicas: 0,
    })

    if (Result.isOk(result)) {
      console.log(`Scaled down MCP server ${mcpServerId} to 0 replicas`)
    } else {
      throw result.error
    }
  } catch (error) {
    console.error(`Failed to scale down MCP server ${mcpServerId}:`, error)
    throw error
  }
}
