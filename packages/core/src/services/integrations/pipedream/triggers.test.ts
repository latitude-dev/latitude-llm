import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentTriggerType, IntegrationType } from '@latitude-data/constants'
import type { Workspace, PipedreamIntegration, DocumentTrigger } from '../../../browser'
import { updatePipedreamTrigger } from './triggers'
import { Result } from '../../../lib/Result'
import type { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import * as appsModule from './apps'
import * as componentsModule from './components/fillConfiguredProps'
import * as triggersModule from './triggers'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import * as factories from '../../../tests/factories'
import type { PipedreamIntegrationConfiguration } from '../helpers/schema'

const mockPipedreamClient = {
  updateTrigger: vi.fn(),
  deleteTrigger: vi.fn(),
  deployTrigger: vi.fn(),
}

vi.mock('@pipedream/sdk', () => ({
  createBackendClient: vi.fn(() => mockPipedreamClient),
}))

describe('updatePipedreamTrigger', () => {
  let workspace: Workspace
  let integration1: PipedreamIntegration & {
    configuration: PipedreamIntegrationConfiguration
  }
  let integration2: PipedreamIntegration & {
    configuration: PipedreamIntegrationConfiguration
  }
  let originalConfig: IntegrationTriggerConfiguration
  let updatedConfig: IntegrationTriggerConfiguration
  let originalTrigger: DocumentTrigger

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createProject()
    workspace = createdWorkspace

    integration1 = (await factories.createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'test-app-1',
        connectionId: 'connection-1',
        externalUserId: 'external-user-1',
        authType: 'oauth',
        oauthAppId: 'oauth-app-1',
      },
    })) as PipedreamIntegration & {
      configuration: PipedreamIntegrationConfiguration
    }

    integration2 = (await factories.createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'test-app-2',
        connectionId: 'connection-2',
        externalUserId: 'external-user-2',
        authType: 'oauth',
        oauthAppId: 'oauth-app-2',
      },
    })) as PipedreamIntegration & {
      configuration: PipedreamIntegrationConfiguration
    }

    originalConfig = {
      integrationId: integration1.id,
      componentId: 'component-1',
      properties: { prop1: 'value1' },
      payloadParameters: ['param1'],
      triggerId: 'trigger-1',
    }

    originalTrigger = {
      id: 123,
      uuid: '000-0000-0000-0000',
      documentUuid: '111-1111-1111-1111',
      projectId: 1,
      workspaceId: workspace.id,
      triggerType: DocumentTriggerType.Integration,
      configuration: originalConfig as IntegrationTriggerConfiguration,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    updatedConfig = {
      integrationId: integration1.id,
      componentId: 'component-1',
      properties: { prop1: 'updatedValue1' },
      payloadParameters: ['param1', 'param2'],
      triggerId: 'trigger-1',
    }

    vi.clearAllMocks()

    vi.spyOn(appsModule, 'getPipedreamEnvironment').mockReturnValue(
      Result.ok({
        environment: 'development' as const,
        credentials: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
        projectId: 'test-project-id',
      }),
    )

    vi.spyOn(componentsModule, 'fillConfiguredProps').mockResolvedValue(
      Result.ok({ prop1: 'filledValue1' }),
    )

    vi.spyOn(triggersModule, 'deployPipedreamTrigger').mockResolvedValue(
      Result.ok({ id: 'new-trigger-id' }),
    )
  })

  describe('when configuration has not changed', () => {
    it('returns the updated config without making external calls', async () => {
      const identicalConfig = { ...originalConfig }

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: identicalConfig,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toEqual(identicalConfig)
      expect(appsModule.getPipedreamEnvironment).not.toHaveBeenCalled()
    })
  })

  describe('when same trigger with different properties', () => {
    beforeEach(() => {
      mockPipedreamClient.updateTrigger.mockResolvedValue({ success: true })
    })

    it('updates the trigger properties successfully', async () => {
      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toEqual(updatedConfig)
      expect(componentsModule.fillConfiguredProps).toHaveBeenCalledWith({
        pipedream: mockPipedreamClient,
        integration: integration1 as PipedreamIntegration,
        componentId: originalConfig.componentId,
        configuredProps: updatedConfig.properties,
      })
      expect(mockPipedreamClient.updateTrigger).toHaveBeenCalledWith({
        id: originalConfig.triggerId,
        externalUserId: integration1.configuration.externalUserId,
        configuredProps: { prop1: 'filledValue1' },
      })
    })

    it('returns error when integration not found', async () => {
      const configWithInvalidIntegration = {
        ...originalConfig,
        integrationId: 99999,
        properties: { prop1: 'updatedValue1' }, // different from original to trigger update path
      }

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: configWithInvalidIntegration,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns error when integration is not Pipedream type', async () => {
      const nonPipedreamIntegration = await factories.createIntegration({
        workspace,
        type: IntegrationType.ExternalMCP,
        configuration: {
          url: 'http://example.com/mcp',
        },
      })

      const configWithNonPipedreamIntegration = {
        ...originalConfig,
        integrationId: nonPipedreamIntegration.id,
        properties: { prop1: 'updatedValue1' }, // different to trigger update path
      }

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: configWithNonPipedreamIntegration,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeInstanceOf(BadRequestError)
      if (result.error) {
        expect(result.error.message).toContain(
          "Integration type 'custom_mcp' is not supported for document triggers",
        )
      }
    })

    it('returns error when getPipedreamEnvironment fails', async () => {
      const envError = new Error('Environment not configured')
      vi.spyOn(appsModule, 'getPipedreamEnvironment').mockReturnValue(Result.error(envError as any))

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(envError)
    })

    it('returns error when fillConfiguredProps fails', async () => {
      const fillPropsError = new Error('Failed to fill props')
      vi.spyOn(componentsModule, 'fillConfiguredProps').mockResolvedValue(
        Result.error(fillPropsError),
      )

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(fillPropsError)
    })

    it('returns error when pipedream updateTrigger fails', async () => {
      const updateError = new Error('Update failed')
      mockPipedreamClient.updateTrigger.mockRejectedValue(updateError)

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(updateError)
    })
  })

  describe('when integration is not configured', () => {
    let unconfiguredIntegration: PipedreamIntegration

    beforeEach(async () => {
      unconfiguredIntegration = (await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          appName: 'unconfigured-test-app',
          metadata: {
            displayName: 'Unconfigured Test App',
            imageUrl: 'https://example.com/image.png',
          },
        },
      })) as PipedreamIntegration
    })

    it('returns error when trying to update to an unconfigured integration', async () => {
      const configWithUnconfiguredIntegration = {
        ...originalConfig,
        integrationId: unconfiguredIntegration.id,
        properties: { prop1: 'updatedValue1' }, // different to trigger update path
      }

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: configWithUnconfiguredIntegration,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeInstanceOf(NotFoundError)
      if (result.error) {
        expect(result.error.message).toContain(
          `Integration '${unconfiguredIntegration.name}' has not been configured`,
        )
      }

      expect(mockPipedreamClient.updateTrigger).not.toHaveBeenCalled()
      expect(mockPipedreamClient.deleteTrigger).not.toHaveBeenCalled()
      expect(mockPipedreamClient.deployTrigger).not.toHaveBeenCalled()
    })

    it('returns error when trying to update properties of an unconfigured integration', async () => {
      const originalConfigUnconfigured = {
        ...originalConfig,
        integrationId: unconfiguredIntegration.id,
      }

      const updatedConfigUnconfigured = {
        ...originalConfigUnconfigured,
        properties: { prop1: 'updatedValue1', newProp: 'newValue' }, // different properties
        payloadParameters: ['param1', 'param2'],
      }

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: updatedConfigUnconfigured,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeInstanceOf(NotFoundError)
      if (result.error) {
        expect(result.error.message).toContain(
          `Integration '${unconfiguredIntegration.name}' has not been configured`,
        )
      }

      expect(mockPipedreamClient.updateTrigger).not.toHaveBeenCalled()
      expect(mockPipedreamClient.deleteTrigger).not.toHaveBeenCalled()
      expect(mockPipedreamClient.deployTrigger).not.toHaveBeenCalled()
    })

    it('returns error when trying to change to a different unconfigured integration', async () => {
      const anotherUnconfiguredIntegration = (await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          appName: 'another-unconfigured-app',
          metadata: {
            displayName: 'Another Unconfigured App',
          },
        },
      })) as PipedreamIntegration

      const configWithDifferentUnconfiguredIntegration = {
        ...originalConfig,
        integrationId: anotherUnconfiguredIntegration.id,
        componentId: 'different-component',
      }

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: configWithDifferentUnconfiguredIntegration,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeInstanceOf(NotFoundError)
      if (result.error) {
        expect(result.error.message).toContain(
          `Integration '${anotherUnconfiguredIntegration.name}' has not been configured`,
        )
      }

      expect(mockPipedreamClient.updateTrigger).not.toHaveBeenCalled()
      expect(mockPipedreamClient.deleteTrigger).not.toHaveBeenCalled()
      expect(mockPipedreamClient.deployTrigger).not.toHaveBeenCalled()
    })
  })

  describe('when different trigger (integration or component changed)', () => {
    let updatedConfigDifferentTrigger: IntegrationTriggerConfiguration

    beforeEach(() => {
      updatedConfigDifferentTrigger = {
        ...updatedConfig,
        integrationId: integration2.id,
        componentId: 'component-2',
      }

      mockPipedreamClient.deleteTrigger.mockResolvedValue({ success: true })
      mockPipedreamClient.deployTrigger.mockResolvedValue({
        data: { id: 'new-trigger-id' },
      })
    })

    it('deletes old trigger and deploys new one successfully', async () => {
      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: updatedConfigDifferentTrigger,
      })

      expect(Result.isOk(result)).toBe(true)
      const resultValue = result.unwrap()
      expect(resultValue.integrationId).toBe(integration2.id)
      expect(resultValue.componentId).toBe('component-2')
      expect(resultValue.triggerId).toBe('new-trigger-id')

      expect(mockPipedreamClient.deleteTrigger).toHaveBeenCalledWith({
        id: originalConfig.triggerId,
        externalUserId: integration1.configuration.externalUserId,
      })

      expect(mockPipedreamClient.deployTrigger).toHaveBeenCalledWith({
        externalUserId: integration2.configuration.externalUserId,
        triggerId: { key: updatedConfigDifferentTrigger.componentId },
        configuredProps: { prop1: 'filledValue1' },
        webhookUrl: expect.stringContaining('/webhook/integration/'),
      })
    })

    it('returns error when delete trigger fails', async () => {
      const deleteError = new Error('Delete failed')
      mockPipedreamClient.deleteTrigger.mockRejectedValue(deleteError)

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: updatedConfigDifferentTrigger,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(deleteError)
    })

    it('returns error when deploy new trigger fails', async () => {
      const deployError = new Error('Deploy failed')
      mockPipedreamClient.deployTrigger.mockRejectedValue(deployError)

      const result = await updatePipedreamTrigger({
        workspace,
        trigger: originalTrigger as Extract<
          DocumentTrigger,
          { configuration: IntegrationTriggerConfiguration }
        >,
        updatedConfig: updatedConfigDifferentTrigger,
      })

      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(deployError)
    })
  })
})
