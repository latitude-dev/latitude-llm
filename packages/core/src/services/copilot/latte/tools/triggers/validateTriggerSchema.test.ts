import * as factories from '@latitude-data/core/factories'
import { Providers, IntegrationType } from '@latitude-data/constants'
import { describe, expect, beforeEach, it, vi } from 'vitest'
import { type Workspace } from '../../../../../schema/models/types/Workspace'
import { type Commit } from '../../../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../../../schema/models/types/DocumentVersion'
import { type User } from '../../../../../schema/models/types/User'
import { type Project } from '../../../../../schema/models/types/Project'
import { PipedreamIntegration } from '../../../../../schema/models/types/Integration'
import { Result } from '../../../../../lib/Result'
import { validateTriggerSchema } from './validateTriggerSchema'
import { LatteToolContext } from '../types'
import * as findIntegrationByIdModule from '../../../../../queries/integrations/findById'
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '@latitude-data/constants/errors'
import * as pipedreamAppsModule from '../../../../integrations/pipedream/apps'
import * as configValidatorModule from './configValidator'
import { PipedreamClient } from '@pipedream/sdk/server'

// Mock the modules
vi.mock('../../../../integrations/pipedream/apps', () => ({
  getPipedreamClient: vi.fn(),
}))

vi.mock('./configValidator', () => ({
  validateLattesChoices: vi.fn(),
}))

vi.mock('@pipedream/sdk/server', () => ({
  PipedreamClient: vi.fn(),
}))

describe('validateTriggerSchema', () => {
  let project: Project
  let workspace: Workspace
  let liveCommit: Commit
  let documents: DocumentVersion[]
  let integration: PipedreamIntegration
  let context: LatteToolContext
  let draftCommit: Commit
  let user: User

  const mockPipedreamClient = {
    components: {
      retrieve: vi.fn(),
      configure: vi.fn(),
    },
    apps: {
      retrieve: vi.fn(),
      list: vi.fn(),
    },
  } as unknown as PipedreamClient

  const mockGetPipedreamClient = vi.mocked(
    pipedreamAppsModule.getPipedreamClient,
  )

  const mockValidateLattesChoices = vi.mocked(
    configValidatorModule.validateLattesChoices,
  )
  const mockPipedreamClientConstructor = vi.mocked(PipedreamClient)

  beforeEach(async () => {
    const {
      project: prj,
      user: usr,
      workspace: wsp,
      commit: livec,
      documents: docs,
    } = await factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Doc 1 commit 1',
        }),
      },
    })
    user = usr
    workspace = wsp
    documents = docs
    liveCommit = livec
    project = prj

    const { commit: draft } = await factories.createDraft({
      project,
      user,
    })
    draftCommit = draft

    integration = {
      id: 3,
      name: 'Slack',
      type: IntegrationType.Pipedream,
      hasTools: true,
      hasTriggers: true,
      configuration: {
        appName: 'slack',
        externalUserId: 'pd_u_abc123def456',
        authType: 'oauth',
        oauthAppId: 'pd_oauth_app_1234567890abcdef',
      },
      workspaceId: workspace.id,
      authorId: 'usr_john_doe_123456',
      mcpServerId: null,
      lastUsedAt: new Date('2025-08-07T14:30:00.000Z'),
      deletedAt: null,
      createdAt: new Date('2025-08-01T09:15:00.000Z'),
      updatedAt: new Date('2025-08-07T14:30:00.000Z'),
    }

    context = {
      workspace,
    } as LatteToolContext

    // Clear all mocks
    vi.clearAllMocks()

    // Setup default mocks
    mockGetPipedreamClient.mockReturnValue(
      Result.ok(mockPipedreamClient as PipedreamClient),
    )

    mockPipedreamClientConstructor.mockReturnValue(
      mockPipedreamClient as PipedreamClient,
    )

    mockValidateLattesChoices.mockResolvedValue(Result.ok(true))
  })

  describe('successful validation', () => {
    it('should validate trigger successfully', async () => {
      // Arrange
      const params = {
        projectId: project.id,
        versionUuid: draftCommit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        payloadParameters: ['subject', 'body'],
        configuration: {
          conversations: ['AABBBCCCDDD'],
          keyword: 'test',
        },
      }

      // Mock successful integration retrieval
      vi.spyOn(
        findIntegrationByIdModule,
        'findIntegrationById',
      ).mockResolvedValue(integration)

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(true)
      expect(mockValidateLattesChoices).toHaveBeenCalledWith({
        pipedream: mockPipedreamClient,
        componentId: 'slack-new-message',
        integration,
        lattesChoices: params.configuration,
      })
    })

    it('should handle missing payloadParameters gracefully', async () => {
      // Arrange
      const params = {
        projectId: project.id,
        versionUuid: draftCommit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          conversations: ['AABBBCCCDDD'],
          keyword: 'test',
        },
      }

      // Mock successful integration retrieval
      vi.spyOn(
        findIntegrationByIdModule,
        'findIntegrationById',
      ).mockResolvedValue(integration)

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(true)
    })
  })

  describe('document validation errors', () => {
    it('should return error when document is not found', async () => {
      // Arrange
      const params = {
        projectId: draftCommit.projectId,
        versionUuid: draftCommit.uuid,
        componentId: 'slack-new-message',
        promptUuid: 'non-existent-uuid',
        integrationId: integration.id,
        configuration: {
          conversations: ['AABBBCCCDDD'],
        },
      }

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeInstanceOf(NotFoundError)
      expect(result.error?.message).toContain(
        'Document with UUID non-existent-uuid not found',
      )
    })

    it('should return error when trying to create trigger on live commit', async () => {
      // Arrange
      const params = {
        projectId: project.id,
        versionUuid: liveCommit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          conversations: ['AABBBCCCDDD'],
        },
      }

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error?.message).toContain(
        'Cannot create triggers on a live commit',
      )
    })
  })

  describe('pipedream client errors', () => {
    it('should return error when pipedream client is not configured', async () => {
      // Arrange
      const params = {
        projectId: project.id,
        versionUuid: draftCommit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          conversations: ['AABBBCCCDDD'],
        },
      }

      const clientError = new UnauthorizedError(
        'Pipedream client not configured',
      )
      mockGetPipedreamClient.mockReturnValue(Result.error(clientError))

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(clientError)
    })
  })

  describe('integration errors', () => {
    it('should return error when integration is not found', async () => {
      // Arrange
      const params = {
        projectId: project.id,
        versionUuid: draftCommit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: 999,
        configuration: {
          conversations: ['AABBBCCCDDD'],
        },
      }

      const integrationError = new NotFoundError('Integration not found')
      vi.spyOn(
        findIntegrationByIdModule,
        'findIntegrationById',
      ).mockRejectedValue(integrationError)

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(integrationError)
    })
  })

  describe('configuration validation errors', () => {
    it('should return error when latte choices validation fails', async () => {
      // Arrange
      const params = {
        projectId: project.id,
        versionUuid: draftCommit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          conversations: ['invalid-channel'],
          keyword: 'test',
        },
      }

      const validationError = new Error('Invalid configuration choices')
      mockValidateLattesChoices.mockResolvedValue(Result.error(validationError))

      vi.spyOn(
        findIntegrationByIdModule,
        'findIntegrationById',
      ).mockResolvedValue(integration)

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(validationError)
    })
  })

  describe('edge cases', () => {
    it('should handle versionUuid as "live" returning an error', async () => {
      // Arrange
      const params = {
        projectId: project.id,
        versionUuid: 'live',
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          conversations: ['AABBBCCCDDD'],
        },
      }

      vi.spyOn(
        findIntegrationByIdModule,
        'findIntegrationById',
      ).mockResolvedValue(integration)

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(false)
    })

    it('should pass correct parameters to validateLattesChoices', async () => {
      // Arrange
      const params = {
        projectId: project.id,
        versionUuid: draftCommit.uuid,
        componentId: 'custom-component',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          customProp: 'customValue',
          anotherProp: 123,
        },
      }

      vi.spyOn(
        findIntegrationByIdModule,
        'findIntegrationById',
      ).mockResolvedValue(integration)

      // Act
      await validateTriggerSchema(params, context)

      // Assert
      expect(mockValidateLattesChoices).toHaveBeenCalledWith({
        pipedream: mockPipedreamClient,
        componentId: 'custom-component',
        integration,
        lattesChoices: params.configuration,
      })
    })
  })
})
