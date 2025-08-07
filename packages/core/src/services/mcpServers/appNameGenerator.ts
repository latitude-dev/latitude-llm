import { createHash } from 'node:crypto'

/**
 * Generate a unique hash for the app name to prevent collisions
 *
 * This creates a short hash based on the app name, workspace ID, and current timestamp
 * to ensure uniqueness even when users deploy multiple apps with the same name.
 *
 * @param appName - The original application name provided by the user
 * @param workspaceId - The workspace ID where the app is being deployed
 * @returns A unique, Kubernetes-compatible app name with hash suffix
 */
export function generateUniqueAppName(appName: string, workspaceId: number): string {
  const timestamp = Date.now().toString()
  const hashInput = `${appName}-${workspaceId}-${timestamp}`
  const hash = createHash('sha1').update(hashInput).digest('hex').substring(0, 8)

  // Ensure the app name is valid for Kubernetes (lowercase, alphanumeric with dashes)
  // Max length for most k8s resources is 63 chars, so we'll limit the base name
  const sanitizedAppName = appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .substring(0, 50) // Leave room for the hash and separator

  return `${sanitizedAppName}-${hash}`
}
