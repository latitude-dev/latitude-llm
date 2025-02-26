import { IntegrationType } from '@latitude-data/constants'
import type { User, Workspace } from '../../browser'
import { database } from '../../client'
import { ErrorResult, Result, Transaction } from '../../lib'
import { integrations } from '../../schema'
import {
  CustomMCPConfiguration,
  InsertMCPServerConfiguration,
} from './helpers/schema'
import { deployMcpServer } from '../mcpServers/deployService'

type InsertConfigurationType<p extends IntegrationType> =
  p extends IntegrationType.CustomMCP
    ? CustomMCPConfiguration
    : InsertMCPServerConfiguration
type IntegrationCreateParams<p extends IntegrationType> = {
  workspace: Workspace
  name: string
  type: p
  configuration: InsertConfigurationType<p>
  author: User
}

export async function createIntegration<p extends IntegrationType>(
  params: IntegrationCreateParams<p>,
  db = database,
) {
  const { workspace, name, type, configuration, author } = params

  // For MCPServer type, first deploy the server
  if (type === IntegrationType.MCPServer) {
    const { environmentVariables = '', runCommand: command } =
      (params.configuration as InsertMCPServerConfiguration) ?? {}

    const deployResult = await deployMcpServer(
      {
        appName: name,
        environmentVariables: parseEnvVars(environmentVariables),
        workspaceId: workspace.id,
        authorId: author.id,
        command,
      },
      db,
    )

    if (!deployResult.ok) return deployResult as ErrorResult<Error>

    const mcpServer = deployResult.unwrap()

    // Now create the integration with a pointer to the MCP server
    return Transaction.call(async (tx) => {
      const result = await tx
        .insert(integrations)
        .values({
          workspaceId: workspace.id,
          name,
          type,
          configuration: {
            url: mcpServer.endpoint,
          },
          authorId: author.id,
          mcpServerId: mcpServer.id,
        })
        .returning()

      return Result.ok(result[0]!)
    }, db)
  }

  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(integrations)
      .values({
        workspaceId: workspace.id,
        name,
        type,
        configuration: configuration as CustomMCPConfiguration,
        authorId: author.id,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}

function parseEnvVars(envVarsInput: string) {
  const _envVarsInput = envVarsInput.includes('\n')
    ? envVarsInput.split('\n')
    : envVarsInput.split(',')

  const environmentVariables: Record<string, string> = {}

  _envVarsInput
    .map((v) => v.trim())
    .filter(Boolean)
    .forEach((envVar) => {
      if (envVar.includes('=')) {
        const [key, ...valueParts] = envVar.split('=')
        const value = valueParts.join('=')
        if (key && value) {
          environmentVariables[key] = value
        } else {
          throw new Error(`Invalid environment variable format: ${envVar}`)
        }
      } else {
        throw new Error(`Invalid environment variable format: ${envVar}`)
      }
    })

  return environmentVariables
}
