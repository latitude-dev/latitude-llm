import { beforeEach, describe, expect, it } from 'vitest'
import { IntegrationDto, Workspace } from '../../browser'
import { IntegrationType } from '@latitude-data/constants'
import { BadRequestError, NotFoundError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import { updateIntegrationConfiguration } from './updateConfiguration'
import { PipedreamIntegrationConfiguration } from './helpers/schema'
import { database } from '../../client'
import { integrations } from '../../schema'
import { eq } from 'drizzle-orm'

describe('updateIntegrationConfiguration', () => {
  let workspace: Workspace
  let unconfiguredIntegration: IntegrationDto
  let configuredIntegration: IntegrationDto
  let nonPipedreamIntegration: IntegrationDto

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace()
    workspace = createdWorkspace

    // Create an unconfigured Pipedream integration
    unconfiguredIntegration = await factories.createIntegration({
      workspace,
      name: 'Test Pipedream Unconfigured',
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'slack',
        authType: 'oauth',
      },
    })

    // Create a configured Pipedream integration
    configuredIntegration = await factories.createIntegration({
      workspace,
      name: 'Test Pipedream Configured',
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'slack',
        authType: 'oauth',
        connectionId: 'connection-123',
        externalUserId: 'user-456',
        oauthAppId: 'oauth-789',
      },
    })

    // Create a non-Pipedream integration
    nonPipedreamIntegration = await factories.createIntegration({
      workspace,
      name: 'Test External MCP',
      type: IntegrationType.ExternalMCP,
      configuration: {
        url: 'https://example.com/mcp',
      },
    })
  })

  it('should successfully update an unconfigured Pipedream integration', async () => {
    const configuration: PipedreamIntegrationConfiguration = {
      appName: 'slack',
      authType: 'oauth',
      connectionId: 'new-connection-123',
      externalUserId: 'new-user-456',
      oauthAppId: 'new-oauth-789',
    }

    const result = await updateIntegrationConfiguration({
      integration: unconfiguredIntegration,
      configuration,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toEqual(
      expect.objectContaining({
        id: unconfiguredIntegration.id,
        configuration,
      }),
    )
  })

  it('should return error for non-Pipedream integration type', async () => {
    const configuration: PipedreamIntegrationConfiguration = {
      appName: 'slack',
      authType: 'oauth',
      connectionId: 'connection-123',
      externalUserId: 'user-456',
      oauthAppId: 'oauth-789',
    }

    const result = await updateIntegrationConfiguration({
      integration: nonPipedreamIntegration,
      configuration,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      'Cannot update configuration for this integration',
    )
  })

  it('should return error when integration is already configured', async () => {
    const configuration: PipedreamIntegrationConfiguration = {
      appName: 'slack',
      authType: 'oauth',
      connectionId: 'new-connection-123',
      externalUserId: 'new-user-456',
      oauthAppId: 'new-oauth-789',
    }

    const result = await updateIntegrationConfiguration({
      integration: configuredIntegration,
      configuration,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe('Integration is already configured')
  })

  it('should return error when app name does not match', async () => {
    const configuration: PipedreamIntegrationConfiguration = {
      appName: 'discord', // Different from integration's appName 'slack'
      authType: 'oauth',
      connectionId: 'connection-123',
      externalUserId: 'user-456',
      oauthAppId: 'oauth-789',
    }

    const result = await updateIntegrationConfiguration({
      integration: unconfiguredIntegration,
      configuration,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      'Configured account does not match the integration app',
    )
  })

  it('should return error when integration is not found in database', async () => {
    // Delete the integration from the database
    await database
      .delete(integrations)
      .where(eq(integrations.id, unconfiguredIntegration.id))

    const configuration: PipedreamIntegrationConfiguration = {
      appName: 'slack',
      authType: 'oauth',
      connectionId: 'connection-123',
      externalUserId: 'user-456',
      oauthAppId: 'oauth-789',
    }

    const result = await updateIntegrationConfiguration({
      integration: unconfiguredIntegration,
      configuration,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toBe('Integration not found')
  })
})
