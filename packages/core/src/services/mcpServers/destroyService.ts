import * as k8s from '@kubernetes/client-node'
import { eq } from 'drizzle-orm'
import yaml from 'js-yaml'
import { type McpServer } from '../../schema/models/types/McpServer'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { mcpServers } from '../../schema/models/mcpServers'
import { getK8sClient } from '../k8s/k8sClient'
import { getDecryptedEnvironmentVariables } from './getDecryptedEnvironmentVariables'

/**
 * Delete a Kubernetes application and all its related resources
 *
 * Using the stored YAML manifest from the database, this function
 * identifies and deletes all resources associated with the application.
 */
export async function destroyMcpServer(
  mcpServer: McpServer,
  transaction = new Transaction(),
) {
  try {
    const client = getK8sClient()
    const kc = client.kc
    const coreV1Api = client.coreV1Api
    const k8sObjectApi = k8s.KubernetesObjectApi.makeApiClient(kc)

    // Delete manifest resources
    try {
      const resources = yaml.loadAll(mcpServer.k8sManifest) as Object[]

      for (const resource of resources) {
        try {
          await k8sObjectApi.delete(resource)
        } catch (resourceError: any) {
          if (resourceError.response?.statusCode !== 404) {
            return Result.error(
              resourceError instanceof Error
                ? resourceError
                : new Error(String(resourceError)),
            )
          }
        }
      }
    } catch (manifestError) {
      return Result.error(
        manifestError instanceof Error
          ? manifestError
          : new Error(String(manifestError)),
      )
    }

    // Delete associated secrets
    try {
      const environmentVariables = getDecryptedEnvironmentVariables(
        mcpServer.environmentVariables,
      )

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
              if (secretDeleteError.response?.statusCode !== 404) {
                return Result.error(
                  secretDeleteError instanceof Error
                    ? secretDeleteError
                    : new Error(String(secretDeleteError)),
                )
              }
            }
          }
        }
      }
    } catch (secretError) {
      return Result.error(
        secretError instanceof Error
          ? secretError
          : new Error(String(secretError)),
      )
    }

    return transaction.call(async (tx) => {
      const k8sApp = await tx
        .update(mcpServers)
        .set({ status: 'deleted' })
        .where(eq(mcpServers.id, mcpServer.id))
        .returning()

      return Result.ok(k8sApp)
    })
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}
