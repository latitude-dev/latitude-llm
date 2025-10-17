import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntegrationType, DocumentTriggerType } from '@latitude-data/constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type DocumentTrigger } from '../../../schema/models/types/DocumentTrigger'
import * as factories from '../../../tests/factories'
import { undeployIntegrationTrigger } from './integrationTrigger'

const publisherSpy = vi.spyOn(
  await import('../../../events/publisher').then((f) => f.publisher),
  'publishLater',
)

// Helper function to check if our specific event was published
const getUndeployRequests = () => {
  return publisherSpy.mock.calls.filter(
    (call) => call[0]?.type === 'documentTriggerUndeployRequested',
  )
}

describe('undeployIntegrationTrigger', () => {
  let workspace: Workspace
  let commit: Commit

  beforeEach(async () => {
    vi.clearAllMocks()

    const { workspace: w, commit: c } = await factories.createProject({
      skipMerge: true,
    })

    workspace = w
    commit = c
  })

  describe('when integration is not found', () => {
    it('returns error when integration does not exist', async () => {
      // Arrange
      const documentTrigger = await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        commitId: commit.id,
        integrationId: 99999, // Non-existent integration
      })

      // Act
      const result = await undeployIntegrationTrigger({
        workspace,
        documentTrigger:
          documentTrigger as DocumentTrigger<DocumentTriggerType.Integration>,
      })

      // Assert
      expect(result.ok).toBeFalsy()
      expect(getUndeployRequests()).toHaveLength(0)
    })
  })

  describe('when integration is not Pipedream', () => {
    it('returns success without publishing event for non-Pipedream integrations', async () => {
      // Arrange
      const integration = await factories.createIntegration({
        workspace,
        type: IntegrationType.ExternalMCP,
        configuration: {
          url: 'https://example.com/mcp',
        },
      })

      const documentTrigger = await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        commitId: commit.id,
        integrationId: integration.id,
      })

      // Act
      const result = await undeployIntegrationTrigger({
        workspace,
        documentTrigger:
          documentTrigger as DocumentTrigger<DocumentTriggerType.Integration>,
      })

      // Assert
      expect(result.ok).toBeTruthy()
      expect(result.value).toBeUndefined()
      expect(getUndeployRequests()).toHaveLength(0)
    })
  })

  describe('when integration is not configured', () => {
    it('returns success without publishing event for unconfigured Pipedream integration', async () => {
      // Arrange
      const integration = await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          // Missing connectionId - not configured
          appName: 'slack',
        },
      })

      const documentTrigger = await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        commitId: commit.id,
        integrationId: integration.id,
      })

      // Act
      const result = await undeployIntegrationTrigger({
        workspace,
        documentTrigger:
          documentTrigger as DocumentTrigger<DocumentTriggerType.Integration>,
      })

      // Assert
      expect(result.ok).toBeTruthy()
      expect(result.value).toBeUndefined()
      expect(getUndeployRequests()).toHaveLength(0)
    })
  })

  describe('when trigger has no deployment settings', () => {
    it('returns success without publishing event when deploymentSettings is null', async () => {
      // Arrange
      const integration = await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          connectionId: 'test-connection-id',
          appName: 'slack',
          externalUserId: 'test-user-id',
        },
      })

      // Create trigger without deployment settings
      const triggerData = await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        commitId: commit.id,
        integrationId: integration.id,
      })

      // Remove deployment settings to simulate undeployed state
      const documentTrigger = {
        ...triggerData,
        deploymentSettings: null,
      } as DocumentTrigger<DocumentTriggerType.Integration>

      // Act
      const result = await undeployIntegrationTrigger({
        workspace,
        documentTrigger,
      })

      // Assert
      expect(result.ok).toBeTruthy()
      expect(result.value).toBeUndefined()
      expect(getUndeployRequests()).toHaveLength(0)
    })

    it('returns success without publishing event when deploymentSettings is undefined', async () => {
      // Arrange
      const integration = await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          connectionId: 'test-connection-id',
          appName: 'slack',
          externalUserId: 'test-user-id',
        },
      })

      const triggerData = await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        commitId: commit.id,
        integrationId: integration.id,
      })

      // Remove deployment settings
      const documentTrigger = {
        ...triggerData,
        deploymentSettings: null,
      } as DocumentTrigger<DocumentTriggerType.Integration>

      // Act
      const result = await undeployIntegrationTrigger({
        workspace,
        documentTrigger,
      })

      // Assert
      expect(result.ok).toBeTruthy()
      expect(result.value).toBeUndefined()
      expect(getUndeployRequests()).toHaveLength(0)
    })
  })

  describe('successful undeployment scheduling', () => {
    it('publishes documentTriggerUndeployRequested event with correct data', async () => {
      // Arrange
      const integration = await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          connectionId: 'test-connection-id',
          appName: 'slack',
          externalUserId: 'test-external-user-id',
        },
      })

      const documentTrigger = (await factories.createIntegrationDocumentTrigger(
        {
          workspaceId: workspace.id,
          commitId: commit.id,
          integrationId: integration.id,
        },
      )) as DocumentTrigger<DocumentTriggerType.Integration>

      // Act
      const result = await undeployIntegrationTrigger({
        workspace,
        documentTrigger,
      })

      // Assert
      expect(result.ok).toBeTruthy()
      expect(result.value).toBeUndefined()

      const undeployRequests = getUndeployRequests()
      expect(undeployRequests).toHaveLength(1)
      expect(undeployRequests[0]![0]).toEqual({
        type: 'documentTriggerUndeployRequested',
        data: {
          workspaceId: workspace.id,
          triggerId: documentTrigger.deploymentSettings!.triggerId,
          externalUserId: 'test-external-user-id',
        },
      })
    })

    it('uses deployment settings triggerId from the document trigger', async () => {
      // Arrange
      const triggerId = 'custom-trigger-id-12345'
      const externalUserId = 'pipedream-user-456'

      const integration = await factories.createIntegration({
        workspace,
        type: IntegrationType.Pipedream,
        configuration: {
          connectionId: 'connection-123',
          appName: 'discord',
          externalUserId,
        },
      })

      // Create trigger with custom deployment settings
      const triggerData = await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        commitId: commit.id,
        integrationId: integration.id,
      })

      const documentTrigger = {
        ...triggerData,
        deploymentSettings: { triggerId },
      } as DocumentTrigger<DocumentTriggerType.Integration>

      // Act
      const result = await undeployIntegrationTrigger({
        workspace,
        documentTrigger,
      })

      // Assert
      expect(result.ok).toBeTruthy()
      const undeployRequests = getUndeployRequests()
      expect(undeployRequests).toHaveLength(1)
      expect(undeployRequests[0]![0]).toEqual({
        type: 'documentTriggerUndeployRequested',
        data: {
          workspaceId: workspace.id,
          triggerId,
          externalUserId,
        },
      })
    })
  })
})
