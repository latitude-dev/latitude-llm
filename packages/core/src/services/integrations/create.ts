import { IntegrationType } from '@latitude-data/constants'
import type { IntegrationDto } from '../../schema/models/types/Integration'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { integrations } from '../../schema/models/integrations'
import { eq } from 'drizzle-orm'
import {
  ExternalMcpIntegrationConfiguration,
  HostedMcpIntegrationConfigurationForm,
  OAuthStatus,
  PipedreamIntegrationConfiguration,
  UnconfiguredPipedreamIntegrationConfiguration,
} from './helpers/schema'
import { getApp } from './pipedream/apps'
import { Workspace } from '../../schema/models/types/Workspace'
import { User } from '../../schema/models/types/User'
import { initiateOAuthRegistration } from './McpClient/oauthRegistration'

type ConfigurationFormTypeMap = {
  [K in IntegrationType]: K extends IntegrationType.ExternalMCP
    ? ExternalMcpIntegrationConfiguration
    : K extends IntegrationType.Pipedream
      ?
          | PipedreamIntegrationConfiguration
          | UnconfiguredPipedreamIntegrationConfiguration
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
  const appResult = await getApp({ name: appName, withConfig: false })
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

export type IntegrationCreateResult = {
  integration: IntegrationDto
  oauthRedirectUrl?: string
}

export async function createIntegration<p extends IntegrationType>(
  params: IntegrationCreateParams<p>,
  transaction = new Transaction(),
): PromisedResult<IntegrationCreateResult> {
  const { workspace, name, type, configuration, author } = params

  if (type === IntegrationType.Latitude) {
    return Result.error(
      new BadRequestError('Cannot create a Latitude integration'),
    )
  }

  const componentsResult = await obtainIntegrationComponents({
    type,
    configuration,
  })

  if (!componentsResult.ok) {
    return Result.error(componentsResult.error!)
  }

  const needsOAuth =
    type === IntegrationType.ExternalMCP &&
    (configuration as ExternalMcpIntegrationConfiguration).useOAuth

  // For OAuth integrations, we need to:
  // 1. Create the integration first (OAuth registration needs the integration ID)
  // 2. Do OAuth registration
  // 3. If OAuth fails, delete the integration
  // This ensures we don't leave orphaned integrations on OAuth failure.

  // For OAuth integrations, set status to pending until callback completes
  const finalConfiguration = needsOAuth
    ? {
        ...(configuration as ExternalMcpIntegrationConfiguration),
        oauthStatus: OAuthStatus.pending,
      }
    : configuration

  const integrationResult = await transaction.call(async (tx) => {
    const result = await tx
      .insert(integrations)
      .values({
        workspaceId: workspace.id,
        name,
        type,
        configuration: finalConfiguration as ExternalMcpIntegrationConfiguration,
        authorId: author.id,
        ...componentsResult.unwrap(),
      })
      .returning()

    return Result.ok(result[0]! as IntegrationDto)
  })

  if (!integrationResult.ok) {
    return Result.error(integrationResult.error!)
  }

  const integration = integrationResult.value!

  if (needsOAuth) {
    const oauthResult = await initiateOAuthRegistration({
      integration,
      authorId: author.id,
    })

    if (!oauthResult.ok) {
      // OAuth failed - delete the integration we just created
      await transaction.call(async (tx) => {
        await tx.delete(integrations).where(eq(integrations.id, integration.id))
        return Result.ok(undefined)
      })
      return Result.error(oauthResult.error!)
    }

    return Result.ok({
      integration,
      oauthRedirectUrl: oauthResult.value,
    })
  }

  return Result.ok({ integration })
}
