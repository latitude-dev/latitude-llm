import { IntegrationType } from '@latitude-data/constants'
import type { IntegrationDto, User, Workspace } from '../../browser'
import { database } from '../../client'
import {
  BadRequestError,
  ErrorResult,
  PromisedResult,
  Result,
  Transaction,
} from '../../lib'
import { integrations } from '../../schema'
import {
  ExternalMcpIntegrationConfiguration,
  HostedMcpIntegrationConfiguration,
  HostedMcpIntegrationConfigurationForm,
} from './helpers/schema'
import { deployMcpServer } from '../mcpServers/deployService'
import { HOSTED_MCP_CONFIGS } from './hostedTypes'

type ConfigurationFormType<T extends IntegrationType> =
  T extends IntegrationType.ExternalMCP
    ? ExternalMcpIntegrationConfiguration
    : HostedMcpIntegrationConfigurationForm

type IntegrationCreateParams<T extends IntegrationType> = {
  workspace: Workspace
  name: string
  type: T
  configuration: ConfigurationFormType<T>
  author: User
}

export async function createIntegration<p extends IntegrationType>(
  params: IntegrationCreateParams<p>,
  db = database,
): PromisedResult<IntegrationDto> {
  const { workspace, name, type, configuration, author } = params

  if (type === IntegrationType.Latitude) {
    return Result.error(
      new BadRequestError('Cannot create a Latitude integration'),
    )
  }

  // For MCPServer type, first deploy the server
  if (type === IntegrationType.HostedMCP) {
    const { env = {}, type: hostedIntegrationType } =
      (params.configuration as HostedMcpIntegrationConfigurationForm) ?? {}

    const command = HOSTED_MCP_CONFIGS[hostedIntegrationType].commandFn(env)

    const deployResult = await deployMcpServer(
      {
        appName: name,
        environmentVariables: env,
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
            type: hostedIntegrationType,
          } as HostedMcpIntegrationConfiguration,
          authorId: author.id,
          mcpServerId: mcpServer.id,
        })
        .returning()

      return Result.ok(result[0]! as IntegrationDto)
    }, db)
  }

  return await Transaction.call(async (tx) => {
    const result = await tx
      .insert(integrations)
      .values({
        workspaceId: workspace.id,
        name,
        type,
        configuration: configuration as ExternalMcpIntegrationConfiguration,
        authorId: author.id,
      })
      .returning()

    return Result.ok(result[0]! as IntegrationDto)
  }, db)
}
