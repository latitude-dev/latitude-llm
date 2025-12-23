import { IntegrationType } from '@latitude-data/constants'
import type { IntegrationDto } from '../../schema/models/types/Integration'
import { BadRequestError, LatitudeError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { initiateOAuthRegistration } from './McpClient/oauthRegistration'
import {
  ExternalMcpIntegrationConfiguration,
  OAuthStatus,
} from './helpers/schema'
import { database } from '../../client'
import { integrations } from '../../schema/models/integrations'
import { eq } from 'drizzle-orm'

type ReauthorizeParams = {
  integration: IntegrationDto
  authorId: string
}

/**
 * Re-initiates OAuth authorization for an existing integration.
 * This is useful when:
 * - The initial OAuth flow was interrupted (user closed the tab)
 * - The OAuth tokens have expired and need to be refreshed
 * - The user wants to re-authenticate with different credentials
 */
export async function reauthorizeIntegration(
  params: ReauthorizeParams,
): Promise<TypedResult<string, LatitudeError>> {
  const { integration, authorId } = params

  if (integration.type !== IntegrationType.ExternalMCP) {
    return Result.error(
      new BadRequestError('Only External MCP integrations support OAuth'),
    )
  }

  const config =
    integration.configuration as ExternalMcpIntegrationConfiguration
  if (!config.useOAuth) {
    return Result.error(
      new BadRequestError('This integration does not use OAuth'),
    )
  }

  // Update status to pending before starting the flow
  const updatedConfiguration: ExternalMcpIntegrationConfiguration = {
    ...config,
    oauthStatus: OAuthStatus.pending,
  }
  await database
    .update(integrations)
    .set({ configuration: updatedConfiguration })
    .where(eq(integrations.id, integration.id))

  // Initiate the OAuth flow
  const oauthResult = await initiateOAuthRegistration({
    integration: {
      ...integration,
      configuration: updatedConfiguration,
    },
    authorId,
  })

  if (!oauthResult.ok) {
    return Result.error(oauthResult.error!)
  }

  return Result.ok(oauthResult.value!)
}
