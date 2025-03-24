import { Result, TypedResult } from '../../lib/Result'
import { mcpServers } from '../../schema/models/mcpServers'
import { getK8sClient } from '../k8s/k8sClient'
import { database } from '../../client'
import { Transaction } from '../../lib'
import { McpServer } from '../../browser'
import { eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'

/**
 * Scale an MCP server deployment up or down
 *
 * This function updates the number of replicas for a Kubernetes deployment
 * and updates the database record with the new manifest.
 *
 * @param params The scaling parameters including the MCP server and desired replicas
 * @returns Result with the updated MCP server or an error
 */
export async function scaleMcpServer(
  {
    mcpServer,
    replicas,
  }: {
    mcpServer: McpServer
    replicas: number
  },
  db = database,
): Promise<TypedResult<McpServer, Error>> {
  try {
    if (replicas < 0) {
      return Result.error(new Error('Replicas cannot be negative'))
    }

    const client = getK8sClient()
    const k8sAppsApi = client.appsV1Api

    publisher.publishLater({
      type: 'scaleMcpServer',
      data: {
        workspaceId: mcpServer.workspaceId,
        mcpServerId: mcpServer.id,
        replicas,
      },
    })

    await k8sAppsApi.patchNamespacedDeployment({
      name: mcpServer.uniqueName,
      namespace: mcpServer.namespace,
      body: [
        {
          op: 'replace',
          path: '/spec/replicas',
          value: replicas,
        },
      ],
    })

    // Update the database record with the new manifest
    return Transaction.call(async (tx) => {
      const updatedRecords = await tx
        .update(mcpServers)
        .set({
          replicas,
          lastUsedAt: new Date(),
        })
        .where(eq(mcpServers.id, mcpServer.id))
        .returning()

      if (!updatedRecords[0]) {
        return Result.error(new Error('Failed to update MCP server'))
      }

      return Result.ok(updatedRecords[0])
    }, db)
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}
