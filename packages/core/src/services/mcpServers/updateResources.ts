import * as k8s from '@kubernetes/client-node'
import { eq } from 'drizzle-orm'
import yaml from 'js-yaml'
import { McpServer } from '../../browser'
import { decrypt } from '../../lib/encryption'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { mcpServers } from '../../schema/models/mcpServers'
import { getK8sClient } from '../k8s/k8sClient'
import { generateK8sManifest } from './manifestGenerator'

/**
 * Updates the Kubernetes resources for an existing MCP server
 *
 * This function:
 * 1. Retrieves the MCP server from the database
 * 2. Optionally regenerates the manifest if regenerateManifest is true
 * 3. Applies the manifest to the Kubernetes cluster
 *
 * @param mcpServerId The ID of the MCP server to update
 * @param options Optional parameters for the update
 * @param db Database instance
 * @returns Result with the updated MCP server or an error
 */
export async function updateMcpServerResources(
  mcpServer: McpServer,
  transaction = new Transaction(),
) {
  try {
    // Initialize Kubernetes client
    const kc = getK8sClient().kc
    const k8sObjectApi = k8s.KubernetesObjectApi.makeApiClient(kc)

    let manifest = mcpServer.k8sManifest

    // Decrypt environment variables
    let environmentVariables = {}
    if (mcpServer.environmentVariables) {
      try {
        const decryptedString = decrypt(mcpServer.environmentVariables)
        environmentVariables = JSON.parse(decryptedString)
      } catch (error) {
        console.error('Failed to decrypt environment variables:', error)
        return Result.error(
          new Error('Failed to decrypt environment variables'),
        )
      }
    }

    // Generate new manifests
    const generatedManifests = generateK8sManifest({
      appName: mcpServer.uniqueName,
      environmentVariables,
      workspaceId: mcpServer.workspaceId,
      authorId: mcpServer.authorId,
      namespace: mcpServer.namespace,
      command: mcpServer.command,
    })

    manifest = generatedManifests.manifest
    const secretManifest = generatedManifests.secretManifest

    // Update the manifest in the database
    transaction.call(async (tx) => {
      const result = await tx
        .update(mcpServers)
        .set({ k8sManifest: manifest })
        .where(eq(mcpServers.id, mcpServer.id))
        .returning()

      return Result.ok(result[0]!)
    })

    // Apply secret manifest if it exists (from regeneration)
    if (secretManifest) {
      try {
        const secrets = yaml.loadAll(secretManifest) as k8s.KubernetesObject[]

        for (const secret of secrets) {
          try {
            // Try to patch the secret if it exists, otherwise create it
            try {
              await k8sObjectApi.patch(secret)
            } catch (patchError: any) {
              if (patchError.response?.statusCode === 404) {
                await k8sObjectApi.create(secret)
              } else {
                throw patchError
              }
            }
          } catch (secretError: any) {
            return Result.error(
              new Error(`Failed to update Secret: ${secretError.message}`),
            )
          }
        }
      } catch (secretError: any) {
        return Result.error(
          new Error(
            `Failed to process Secret manifest: ${secretError.message}`,
          ),
        )
      }
    }

    // Apply the main manifest
    try {
      const resources = yaml.loadAll(manifest) as k8s.KubernetesObject[]

      // Apply all resources
      const applyResults = await Promise.all(
        resources.map(async (resource) => {
          try {
            // Try to patch the resource if it exists, otherwise create it
            try {
              return Result.ok(await k8sObjectApi.patch(resource))
            } catch (patchError: any) {
              if (patchError.response?.statusCode === 404) {
                return Result.ok(await k8sObjectApi.create(resource))
              } else {
                const kind = resource.kind || 'unknown'
                const name = resource.metadata?.name || 'unnamed'
                return Result.error(
                  new Error(
                    `Failed to patch ${kind}/${name}: ${patchError.message}`,
                  ),
                )
              }
            }
          } catch (error: any) {
            const kind = resource.kind || 'unknown'
            const name = resource.metadata?.name || 'unnamed'
            return Result.error(
              new Error(`Failed to update ${kind}/${name}: ${error.message}`),
            )
          }
        }),
      )

      // Check if any operations failed
      const failures = applyResults.filter((result) => !result.ok)
      if (failures.length > 0) {
        const errorMessages = failures
          .map((failure) => failure.error!.message)
          .join('; ')
        return Result.error(
          new Error(`Failed to apply one or more resources: ${errorMessages}`),
        )
      }

      return transaction.call(async (tx) => {
        const result = await tx
          .update(mcpServers)
          .set({
            status: 'deploying',
            lastAttemptAt: new Date(),
          })
          .where(eq(mcpServers.id, mcpServer.id))
          .returning()

        return Result.ok(result[0]!)
      })
    } catch (manifestError: any) {
      return Result.error(
        new Error(`Failed to apply manifest: ${manifestError.message}`),
      )
    }
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}
