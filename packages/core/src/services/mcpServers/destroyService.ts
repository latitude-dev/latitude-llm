import { eq } from 'drizzle-orm'
import { Result } from '../../lib/Result'
import { mcpServers } from '../../schema/models/mcpServers'
import { getK8sClient } from '../k8s/k8sClient'
import { Transaction } from '../../lib'
import { database } from '../../client'
import yaml from 'js-yaml'
import * as k8s from '@kubernetes/client-node'
import { McpServer } from '../../browser'

/**
 * Delete a Kubernetes application and all its related resources
 *
 * Using the stored YAML manifest from the database, this function
 * identifies and deletes all resources associated with the application.
 */
export async function destroyMcpServer(mcpServer: McpServer, db = database) {
  try {
    const client = getK8sClient()
    const kc = client.kc
    const coreV1Api = client.coreV1Api
    const k8sObjectApi = k8s.KubernetesObjectApi.makeApiClient(kc)

    // If we have a stored manifest, use it to delete resources
    try {
      // Parse the multi-document YAML
      const resources = yaml.loadAll(mcpServer.k8sManifest) as Object[]

      for (const resource of resources) {
        try {
          await k8sObjectApi.delete(resource)
        } catch (resourceError: any) {
          // Check if the error is a "not found" error (404)
          // If so, we can safely continue with other resources
          if (resourceError.response?.statusCode === 404) {
            console.log(
              `Resource not found, already deleted: ${JSON.stringify(resource)}`,
            )
          } else {
            // For other errors, log but continue with deletion process
            console.error(`Error deleting resource: ${resourceError.message}`)
          }
        }
      }
    } catch (manifestError) {
      // If there's an error parsing the manifest, we should still try to delete secrets
      console.error('Error processing manifest:', manifestError)
    }

    // Delete associated secrets
    try {
      // Parse environment variables to get the secret hash
      const environmentVariables = mcpServer.environmentVariables
        ? JSON.parse(mcpServer.environmentVariables)
        : {}

      // Only attempt to delete secrets if the mcpServer had environment variables
      if (Object.keys(environmentVariables).length > 0) {
        const secretsList = await coreV1Api.listNamespacedSecret({
          namespace: mcpServer.namespace,
        })

        // Find and delete any secrets that match the pattern {uniqueName}-secrets-*
        const secretPrefix = `${mcpServer.uniqueName}-secrets-`
        const appSecrets = secretsList.items.filter((secret) =>
          secret.metadata?.name?.startsWith(secretPrefix),
        )

        for (const secret of appSecrets) {
          if (secret.metadata?.name && secret.metadata?.namespace) {
            try {
              await coreV1Api.deleteNamespacedSecret({
                name: secret.metadata.name,
                namespace: secret.metadata.namespace,
              })
            } catch (secretDeleteError: any) {
              // Check if the error is a "not found" error (404)
              if (secretDeleteError.response?.statusCode === 404) {
                console.log(
                  `Secret not found, already deleted: ${secret.metadata.name}`,
                )
              } else {
                // For other errors, log but continue with deletion process
                console.error(
                  `Error deleting secret: ${secretDeleteError.message}`,
                )
              }
            }
          }
        }
      }
    } catch (secretError) {
      // Log the error but continue with the deletion process
      console.error('Error processing secrets:', secretError)
    }

    // Mark the application as deleted
    return Transaction.call(async (tx) => {
      const k8sApp = await tx
        .update(mcpServers)
        .set({ status: 'deleted' })
        .where(eq(mcpServers.id, mcpServer.id))
        .returning()

      return Result.ok(k8sApp)
    }, db)
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}

/**
 * Update the status of a K8s mcpServer to be deleted
 *
 * This marks the mcpServer for deletion by a background job
 * TODO: Use this service in actions and destroy the mcpServer in the background
 */
export async function markMcpServerForDeletion(
  mcpServer: McpServer,
  db = database,
) {
  try {
    return Transaction.call(async (tx) => {
      await tx
        .update(mcpServers)
        .set({
          status: 'deleting',
          lastAttemptAt: new Date(),
        })
        .where(eq(mcpServers.id, mcpServer.id))

      return Result.nil()
    }, db)
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}
