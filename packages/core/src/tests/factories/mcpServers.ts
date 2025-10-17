import { faker } from '@faker-js/faker'

import { type McpServer } from '../../schema/models/types/McpServer'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { mcpServers } from '../../schema/models/mcpServers'

export type ICreateMcpServer = {
  workspace: Workspace
  name?: string
  status?: 'deploying' | 'deployed' | 'failed' | 'deleted'
  lastUsedAt?: Date
  authorId?: string
  command?: string
  replicas?: number
  environmentVariables?: Record<string, string>
}

function generateTestUniqueName(name: string, workspaceId: number): string {
  const testHash = faker.string.alphanumeric({ length: 6 })
  return `test-${name}-${workspaceId}-${testHash}`.toLowerCase()
}

export async function createMcpServer({
  workspace,
  name = faker.word.sample(),
  status = 'deployed',
  lastUsedAt = new Date(),
  authorId,
  command = 'python app.py',
  environmentVariables = {},
  replicas = 1,
}: ICreateMcpServer): Promise<McpServer> {
  const uniqueAppName = generateTestUniqueName(name, workspace.id)
  const testNamespace = `test-workspace-${workspace.id}`

  const server = await database
    .insert(mcpServers)
    .values({
      workspaceId: workspace.id,
      authorId: authorId ?? workspace.creatorId!,
      name,
      uniqueName: uniqueAppName,
      status,
      lastAttemptAt: new Date(),
      lastUsedAt,
      namespace: testNamespace,
      k8sManifest: '', // Empty since we're not actually deploying
      environmentVariables: JSON.stringify(environmentVariables), // For testing, we don't need encryption
      endpoint: `${uniqueAppName}.test.local`,
      command,
      replicas,
    })
    .returning()
    .then((r) => r[0]!)

  return server
}
