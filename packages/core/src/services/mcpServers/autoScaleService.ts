import { Result } from '../../lib/Result'
import { mcpServers } from '../../schema/models/mcpServers'
import { subscriptions } from '../../schema/models/subscriptions'
import { database } from '../../client'
import { and, eq, lt, inArray, gt } from 'drizzle-orm'
import { SubscriptionPlan } from '../../plans'
import { workspaces } from '../../schema/models/workspaces'
import { queues } from '../../jobs/queues'

const INACTIVITY_THRESHOLD_MINUTES = 10
const SCALE_DOWN_REPLICAS = 0

/**
 * Automatically scales down MCP servers that haven't been used recently
 * Only scales down servers for workspaces on hobby plans
 *
 * This function finds all deployed MCP servers that haven't been used
 * in the last INACTIVITY_THRESHOLD_MINUTES minutes and enqueues jobs to scale them down
 * to 0 replicas, but only for workspaces on hobby plans.
 */
export async function autoScaleInactiveServers(db = database) {
  try {
    const inactiveServers = await db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .innerJoin(workspaces, eq(mcpServers.workspaceId, workspaces.id))
      .innerJoin(
        subscriptions,
        eq(workspaces.currentSubscriptionId, subscriptions.id),
      )
      .where(
        and(
          lt(
            mcpServers.lastUsedAt,
            new Date(Date.now() - INACTIVITY_THRESHOLD_MINUTES * 60 * 1000), // Last 10 minutes
          ),
          gt(mcpServers.replicas, SCALE_DOWN_REPLICAS),
          eq(mcpServers.status, 'deployed'),
          inArray(subscriptions.plan, [
            SubscriptionPlan.HobbyV1,
            SubscriptionPlan.HobbyV2,
            SubscriptionPlan.HobbyV3,
          ]),
        ),
      )

    // Enqueue a job for each inactive server
    const jobPromises = inactiveServers.map(async (server) => {
      const { maintenanceQueue } = await queues()
      return maintenanceQueue.add('scaleDownMcpServerJob', {
        mcpServerId: server.id,
      })
    })

    await Promise.all(jobPromises)

    return Result.ok(inactiveServers.length)
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}
