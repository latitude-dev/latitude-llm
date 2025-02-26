import { Result } from '../../lib/Result'
import { McpServer } from '../../schema/types'
import { database } from '../../client'
import {
  mcpServers,
  k8sAppStatusEnum,
} from '../../schema/models/mcpServers'
import { getK8sClient } from '../k8s/k8sClient'
import { V1DeploymentCondition } from '@kubernetes/client-node'
import { Transaction } from '../../lib'
import { eq } from 'drizzle-orm'

/**
 * Checks the status of an mcpServer in the cluster and updates the database if needed
 */
export async function checkAndUpdateMcpServerStatus(
  mcpServer: McpServer,
  db = database,
) {
  try {
    // Get the K8s client
    const k8sClient = getK8sClient()

    // Get the current status from K8s
    let currentStatus: (typeof k8sAppStatusEnum.enumValues)[number] = 'pending'

    try {
      // Check if the deployment exists
      const deploymentResponse =
        await k8sClient.appsV1Api.readNamespacedDeployment({
          name: mcpServer.uniqueName,
          namespace: mcpServer.namespace,
        })

      // Determine the status based on the deployment conditions
      if (
        deploymentResponse.status?.availableReplicas &&
        deploymentResponse.status.availableReplicas > 0
      ) {
        currentStatus = 'deployed'
      } else if (deploymentResponse.status?.conditions) {
        // Check for specific conditions
        const progressingCondition = deploymentResponse.status.conditions.find(
          (condition: V1DeploymentCondition) =>
            condition.type === 'Progressing',
        )

        if (progressingCondition && progressingCondition.status === 'True') {
          currentStatus = 'deploying'
        } else {
          const availableCondition = deploymentResponse.status.conditions.find(
            (condition: V1DeploymentCondition) =>
              condition.type === 'Available',
          )

          if (availableCondition && availableCondition.status === 'False') {
            currentStatus = 'failed'
          }
        }
      }
    } catch (error) {
      // If the deployment doesn't exist, check if it's being created
      try {
        // Check if there are any pods for this application
        const podListResponse = await k8sClient.coreV1Api.listNamespacedPod({
          namespace: mcpServer.namespace,
        })

        if (podListResponse.items.length > 0) {
          // There are pods, check their status
          const pods = podListResponse.items
          const pendingPods = pods.filter(
            (pod) => pod.status?.phase === 'Pending',
          )

          if (pendingPods.length > 0) {
            currentStatus = 'deploying'
          } else {
            // If all pods are not pending, check if any are failing
            const failingPods = pods.filter(
              (pod) =>
                pod.status?.phase === 'Failed' ||
                pod.status?.phase === 'Unknown',
            )

            if (failingPods.length > 0) {
              currentStatus = 'failed'
            }
          }
        } else {
          // No pods found, the application might be deleted or not yet created
          currentStatus = 'pending'
        }
      } catch (podError) {
        return Result.error(
          podError instanceof Error ? podError : new Error(String(podError)),
        )
      }
    }

    // If the status is different from the current one in the database, update it
    if (currentStatus !== mcpServer.status) {
      const updateResult = await updateMcpServerStatus(
        mcpServer,
        currentStatus,
        db,
      )

      return updateResult
    }

    return Result.ok(mcpServer)
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}

/**
 * Update the status of an mcpServer in the database
 *
 * This function should be called by a background job that
 * monitors the status of deployments.
 */
export async function updateMcpServerStatus(
  mcpServer: McpServer,
  status: (typeof k8sAppStatusEnum.enumValues)[number],
  db = database,
) {
  try {
    const now = new Date()

    return Transaction.call(async (tx) => {
      const result = await tx
        .update(mcpServers)
        .set({
          status,
          ...(status === 'deployed' ? { deployedAt: now } : {}),
          lastAttemptAt: now,
        })
        .where(eq(mcpServers.id, mcpServer.id))
        .returning()

      return Result.ok(result[0]!)
    }, db)
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}
