import * as k8s from '@kubernetes/client-node'
import { eq } from 'drizzle-orm'
import type { McpServer } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { mcpServers } from '../../schema/models/mcpServers'
import { getK8sClient } from '../k8s/k8sClient'
type DeploymentStatus = 'deploying' | 'deployed' | 'failed' | 'deleted'

/**
 * Retrieves the latest status of a MCP server deployment from Kubernetes
 * and updates the database if the status has changed.
 *
 * @param mcpServer The MCP server instance
 * @param db Database instance
 * @returns Result with the updated MCP server record
 */
export async function updateMcpServerStatus(mcpServer: McpServer, transaction = new Transaction()) {
  try {
    // Initialize Kubernetes client
    const kc = getK8sClient().kc
    const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api)
    const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api)

    const namespace = mcpServer.namespace
    const deploymentName = mcpServer.uniqueName

    try {
      // Get deployment status
      const deploymentResponse = await k8sAppsApi.readNamespacedDeployment({
        namespace,
        name: deploymentName,
      })

      // Determine the current status based on deployment conditions
      let currentStatus: DeploymentStatus = 'deploying'

      // Check if deployment is available
      const availableCondition = deploymentResponse.status?.conditions?.find(
        (condition) => condition.type === 'Available',
      )

      // Check if deployment has progressed
      const progressingCondition = deploymentResponse.status?.conditions?.find(
        (condition) => condition.type === 'Progressing',
      )

      // Check if all replicas are ready
      const readyReplicas = deploymentResponse.status?.readyReplicas || 0
      const desiredReplicas = deploymentResponse.status?.replicas || 0

      if (availableCondition?.status === 'True' && readyReplicas === desiredReplicas) {
        currentStatus = 'deployed'
      } else if (progressingCondition?.status === 'False') {
        currentStatus = 'failed'
      }

      // Check for pod failures that might not be reflected in deployment status
      const podList = await k8sCoreApi.listNamespacedPod({
        namespace,
        labelSelector: `app=${deploymentName}`,
      })

      // Check if any pods are in a failed state
      const failedPod = podList.items.find((pod) => {
        const containerStatuses = pod.status?.containerStatuses || []
        return containerStatuses.some(
          (status) =>
            status.state?.waiting?.reason === 'CrashLoopBackOff' ||
            status.state?.waiting?.reason === 'ImagePullBackOff' ||
            status.state?.waiting?.reason === 'ErrImagePull',
        )
      })

      if (failedPod) {
        currentStatus = 'failed'
      }

      // If the status hasn't changed, return the current record
      if (mcpServer.status === currentStatus) {
        return Result.ok(mcpServer)
      }

      // Update the status in the database
      return transaction.call(async (tx) => {
        const updatedRecords = await tx
          .update(mcpServers)
          .set({
            status: currentStatus,
          })
          .where(eq(mcpServers.id, mcpServer.id))
          .returning()

        return Result.ok(updatedRecords[0]!)
      })
    } catch (k8sError: any) {
      // If the deployment doesn't exist, mark it as terminated
      if (k8sError.response?.statusCode === 404) {
        return transaction.call(async (tx) => {
          const updatedRecords = await tx
            .update(mcpServers)
            .set({
              status: 'deleted',
            })
            .where(eq(mcpServers.id, mcpServer.id))
            .returning()

          return Result.ok(updatedRecords[0]!)
        })
      }

      return Result.error(new Error(`Failed to fetch deployment status: ${k8sError.message}`))
    }
  } catch (error) {
    return Result.error(error instanceof Error ? error : new Error(String(error)))
  }
}
