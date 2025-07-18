import { IntegrationType } from '@latitude-data/constants'
import type { IntegrationDto, User, Workspace } from '../../browser'
import { BadRequestError } from '../../lib/errors'
import { ErrorResult, Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { integrations } from '../../schema'
import { deployMcpServer } from '../mcpServers/deployService'
import {
  ExternalMcpIntegrationConfiguration,
  HostedMcpIntegrationConfiguration,
  HostedMcpIntegrationConfigurationForm,
  PipedreamIntegrationConfiguration,
} from './helpers/schema'
import { HOSTED_MCP_CONFIGS } from './hostedTypes'
import { getApp } from './pipedream/apps'

type ConfigurationFormTypeMap = {
  [K in IntegrationType]: K extends IntegrationType.ExternalMCP
    ? ExternalMcpIntegrationConfiguration
    : K extends IntegrationType.Pipedream
      ? PipedreamIntegrationConfiguration
      : HostedMcpIntegrationConfigurationForm
}

type ConfigurationFormType<T extends IntegrationType> =
  T extends keyof ConfigurationFormTypeMap ? ConfigurationFormTypeMap[T] : never

async function obtainIntegrationComponents<T extends IntegrationType>({
  type,
  configuration,
}: {
  type: T
  configuration: ConfigurationFormType<T>
}): PromisedResult<{ hasTools: boolean; hasTriggers: boolean }> {
  if (type !== IntegrationType.Pipedream) {
    return Result.ok({
      hasTools: true,
      hasTriggers: false,
    })
  }

  const appName = (configuration as PipedreamIntegrationConfiguration).appName
  const appResult = await getApp({ name: appName })
  if (!appResult.ok) {
    return Result.error(appResult.error!)
  }

  const app = appResult.unwrap()
  return Result.ok({
    hasTools: app.tools.length > 0,
    hasTriggers: app.triggers.length > 0,
  })
}

type IntegrationCreateParams<T extends IntegrationType> = {
  workspace: Workspace
  name: string
  type: T
  configuration: ConfigurationFormType<T>
  author: User
}

export async function createIntegration<p extends IntegrationType>(
  params: IntegrationCreateParams<p>,
  transaction = new Transaction(),
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

    const command = HOSTED_MCP_CONFIGS[hostedIntegrationType].command

    const deployResult = await deployMcpServer(
      {
        appName: name,
        environmentVariables: env,
        workspaceId: workspace.id,
        authorId: author.id,
        command,
      },
      transaction,
    )

    if (!deployResult.ok) return deployResult as ErrorResult<Error>

    const mcpServer = deployResult.unwrap()

    // Now create the integration with a pointer to the MCP server
    return transaction.call(async (tx) => {
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
          hasTools: true,
          hasTriggers: false,
        })
        .returning()

      return Result.ok(result[0]! as IntegrationDto)
    })
  }

  const componentsResult = await obtainIntegrationComponents({
    type,
    configuration,
  })

  if (!componentsResult.ok) {
    return Result.error(componentsResult.error!)
  }

  return await transaction.call(async (tx) => {
    const result = await tx
      .insert(integrations)
      .values({
        workspaceId: workspace.id,
        name,
        type,
        configuration: configuration as ExternalMcpIntegrationConfiguration,
        authorId: author.id,
        ...componentsResult.unwrap(),
      })
      .returning()

    return Result.ok(result[0]! as IntegrationDto)
  })
}
