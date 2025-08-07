import * as k8s from '@kubernetes/client-node'
import { Writable } from 'node:stream'
import type { McpServer } from '../../browser'
import { Result, type TypedResult } from '../../lib/Result'
import { getK8sClient } from '../k8s/k8sClient'

/**
 * LogOptions interface for configuring log retrieval
 */
export interface LogOptions {
  /**
   * Number of lines from the end of the logs to show
   */
  tailLines?: number
  /**
   * If true, add timestamp at the beginning of each log line
   */
  timestamps?: boolean
  /**
   * If true, return logs from previously terminated containers
   */
  previous?: boolean
  /**
   * Maximum number of bytes to return
   */
  limitBytes?: number
}

/**
 * Retrieves logs from Kubernetes pods associated with an MCP server
 *
 * @param mcpServer - The MCP server to retrieve logs from
 * @param options - Optional configuration for log retrieval
 * @param db - Database instance
 * @returns A Result containing the logs as a string or an error
 */
export async function getLogs(
  mcpServer: McpServer,
  options: LogOptions = {
    tailLines: 100,
    timestamps: true,
    previous: false,
  },
): Promise<TypedResult<string, Error>> {
  try {
    // Initialize Kubernetes client
    const k8sClient = getK8sClient()
    const coreV1Api = k8sClient.coreV1Api

    // The namespace should be stored in the MCP server record
    const namespace = mcpServer.namespace

    // The pod name should match the unique name of the MCP server
    // This assumes the deployment was created with the unique name
    const labelSelector = `app=${mcpServer.uniqueName}`

    // Get all pods with the matching label in the namespace
    const podsResponse = await coreV1Api.listNamespacedPod({
      namespace,
      labelSelector,
    })

    // If no pods are found, return an error
    if (!podsResponse.items || podsResponse.items.length === 0) {
      return Result.error(new Error(`No pods found for MCP server ${mcpServer.name}`))
    }

    // Get the first pod (we could potentially get logs from all pods)
    const pod = podsResponse.items[0]
    if (!pod) return Result.ok('')

    const podName = pod.metadata!.name!

    // Get the container name (usually the first container)
    const containerName = pod.spec?.containers[0]?.name
    if (!containerName)
      return Result.error(new Error(`No container name found for MCP server ${mcpServer.name}`))

    // Create a string to store the logs
    let logs = ''

    // Create a writable stream that collects logs into the string
    const logStream = new Writable({
      write(chunk, _, callback) {
        logs += chunk.toString()
        callback()
      },
    })

    // Create a Promise that resolves when the log collection is complete
    const logPromise = new Promise<string>((resolve, reject) => {
      logStream.on('finish', () => resolve(logs))
      logStream.on('error', (err) => reject(err))
    })

    // Use the log functionality from the k8s client
    const log = new k8s.Log(k8sClient.kc)

    // Start streaming logs
    await log.log(namespace, podName, containerName, logStream, {
      follow: false, // Don't follow logs (just get current logs)
      tailLines: options.tailLines,
      timestamps: options.timestamps,
      previous: options.previous,
      limitBytes: options.limitBytes,
    })

    // Wait for logs to be collected
    const logResult = await logPromise

    return Result.ok(logResult)
  } catch (error) {
    return Result.error(error instanceof Error ? error : new Error(String(error)))
  }
}
