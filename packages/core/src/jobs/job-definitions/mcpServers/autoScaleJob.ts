import { Job } from 'bullmq'
import { Result } from '../../../lib/Result'
import { autoScaleInactiveServers } from '../../../services/mcpServers/autoScaleService'

export type AutoScaleJobData = unknown

/**
 * Job that scales down inactive MCP servers
 *
 * This job:
 * 1. Finds all deployed MCP servers that haven't been used in the last 10 minutes
 * 2. Scales them down to 0 replicas to save resources
 */
export const autoScaleJob = async (_: Job<AutoScaleJobData>) => {
  const result = await autoScaleInactiveServers()

  if (Result.isOk(result)) {
    console.log(`Scaled down ${result.value} inactive MCP servers`)
  } else {
    console.error('Failed to scale down inactive servers:', result.error)
    throw result.error
  }
}
