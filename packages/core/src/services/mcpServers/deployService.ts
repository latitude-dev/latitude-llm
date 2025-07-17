import * as k8s from '@kubernetes/client-node'
import { env } from '@latitude-data/env'
import yaml from 'js-yaml'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { encrypt } from '../../lib/encryption'
import { mcpServers } from '../../schema/models/mcpServers'
import { getK8sClient } from '../k8s/k8sClient'
import { generateUniqueAppName } from './appNameGenerator'
import { generateK8sManifest } from './manifestGenerator'
type K8sDeploymentParams = {
  appName: string
  environmentVariables?: Record<string, string>
  workspaceId: number
  authorId: string
  command: string
}

/**
 * Deploy a Kubernetes application using a combined manifest approach
 *
 * This function generates a multi-document YAML manifest for all resources,
 * stores it in the database, and applies it to the cluster.
 * Secrets are handled separately for security.
 */
export async function deployMcpServer(
  {
    appName,
    environmentVariables = {},
    workspaceId,
    authorId,
    command,
  }: K8sDeploymentParams,
  db = database,
) {
  try {
    // Generate a unique app name with hash to prevent collisions
    const uniqueAppName = generateUniqueAppName(appName, workspaceId)

    // Use the namespace from config or fall back to the specified namespace
    const targetNamespace = `${env.NODE_ENV}-workspace-${workspaceId}`

    // Initialize Kubernetes client
    const kc = getK8sClient().kc
    const k8sObjectApi = k8s.KubernetesObjectApi.makeApiClient(kc)

    // Create the namespace if it doesn't exist
    try {
      const namespaceManifest = {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: targetNamespace,
        },
      } as k8s.KubernetesObject

      await k8sObjectApi.create(namespaceManifest)
    } catch (namespaceError: any) {
      // If namespace already exists (409 Conflict), we can continue safely
      if (namespaceError.code === 409) {
        // Namespace already exists, continuing deployment,
      } else {
        // For other errors, fail the deployment
        return Result.error(
          new Error(`Failed to create namespace: ${namespaceError.message}`),
        )
      }
    }

    // Generate the Kubernetes manifests
    const { manifest, secretManifest } = generateK8sManifest({
      appName: uniqueAppName,
      environmentVariables,
      workspaceId,
      authorId,
      namespace: targetNamespace,
      command,
    })

    // Apply secret manifest (separately for security)
    if (secretManifest) {
      try {
        // Parse and apply the secret
        const secrets = yaml.loadAll(secretManifest) as k8s.KubernetesObject[]

        for (const secret of secrets) {
          await k8sObjectApi.create(secret)
        }
      } catch (secretError: any) {
        return Result.error(
          new Error(`Failed to create Secret: ${secretError.message}`),
        )
      }
    }

    // Apply the combined manifest
    try {
      const resources = yaml.loadAll(manifest) as k8s.KubernetesObject[]

      // Apply all resources, failing if they already exist
      const applyPromises = resources.map(async (resource) => {
        try {
          // Try to create the resource
          return await k8sObjectApi.create(resource)
        } catch (createError: any) {
          // If resource already exists (409 Conflict), fail with a clear message
          if (createError.response?.statusCode === 409) {
            const kind = resource.kind || 'unknown'
            const name = resource.metadata?.name || 'unnamed'
            throw new Error(
              `${kind} '${name}' already exists. Please delete it manually before redeploying.`,
            )
          } else {
            // For other errors, rethrow with resource info
            const kind = resource.kind || 'unknown'
            const name = resource.metadata?.name || 'unnamed'
            throw new Error(
              `Failed to create ${kind}/${name}: ${createError.message}`,
            )
          }
        }
      })

      try {
        // Wait for all resources to be applied
        await Promise.all(applyPromises)
      } catch (error: unknown) {
        // Rethrow with more context
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        throw new Error(
          `Failed to apply one or more resources: ${errorMessage}`,
        )
      }
    } catch (manifestError: any) {
      return Result.error(
        new Error(`Failed to apply manifest: ${manifestError.message}`),
      )
    }

    // Store the manifest in the database
    return Transaction.call(async (tx) => {
      const mcpServerResult = await tx
        .insert(mcpServers)
        .values({
          workspaceId,
          authorId,
          name: appName,
          uniqueName: uniqueAppName,
          status: 'deploying',
          lastAttemptAt: new Date(),
          namespace: targetNamespace,
          k8sManifest: manifest,
          environmentVariables: encrypt(JSON.stringify(environmentVariables)),
          endpoint: `${uniqueAppName}.${env.LATITUDE_MCP_HOST}`,
          replicas: 1,
          command,
        })
        .returning()

      return Result.ok(mcpServerResult[0]!)
    }, db)
  } catch (error) {
    return Result.error(
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}
