import * as factories from '@latitude-data/core/factories'
import { Providers, IntegrationType } from '@latitude-data/constants'
import { describe, expect, beforeEach, it, vi } from 'vitest'
import {
  Workspace,
  Commit,
  DocumentVersion,
  PipedreamIntegration,
} from '../../../../../browser'
import { Result } from '../../../../../lib/Result'
import { validateTriggerSchema } from './validateTriggerSchema'
import { LatteToolContext } from '../types'
import { IntegrationsRepository } from '../../../../../repositories'
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '@latitude-data/constants/errors'
import * as pipedreamAppsModule from '../../../../integrations/pipedream/apps'
import * as configValidatorModule from './configValidator'
import { BackendClient, createBackendClient } from '@pipedream/sdk'

// Mock the modules
vi.mock('../../../../integrations/pipedream/apps', () => ({
  getPipedreamEnvironment: vi.fn(),
}))

vi.mock('./configValidator', () => ({
  validateLattesChoices: vi.fn(),
}))

vi.mock('@pipedream/sdk', () => ({
  createBackendClient: vi.fn(),
}))

describe('validateTriggerSchema', () => {
  let workspace: Workspace
  let commit: Commit
  let documents: DocumentVersion[]
  let integration: PipedreamIntegration
  let context: LatteToolContext

  const mockPipedreamClient: Partial<BackendClient> = {
    getComponent: vi.fn(),
    configureComponent: vi.fn(),
  }

  const mockGetPipedreamEnvironment = vi.mocked(
    pipedreamAppsModule.getPipedreamEnvironment,
  )

  const mockValidateLattesChoices = vi.mocked(
    configValidatorModule.validateLattesChoices,
  )
  const mockCreateBackendClient = vi.mocked(createBackendClient)

  beforeEach(async () => {
    const project = await factories.createProject({
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
    workspace = project.workspace
    commit = project.commit
    documents = project.documents

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
    mockGetPipedreamEnvironment.mockReturnValue(
      Result.ok({
        environment: 'development' as const,
        credentials: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
        projectId: 'test-project-id',
      }),
    )

    mockCreateBackendClient.mockReturnValue(
      mockPipedreamClient as BackendClient,
    )

    mockValidateLattesChoices.mockResolvedValue(Result.ok(true))
  })

  describe('successful validation', () => {
    it('should validate trigger successfully', async () => {
      // Arrange
      const params = {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
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
      vi.spyOn(IntegrationsRepository.prototype, 'find').mockResolvedValue(
        Result.ok(integration),
      )

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
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          conversations: ['AABBBCCCDDD'],
          keyword: 'test',
        },
      }

      // Mock successful integration retrieval
      vi.spyOn(IntegrationsRepository.prototype, 'find').mockResolvedValue(
        Result.ok(integration),
      )

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
        projectId: commit.projectId,
        versionUuid: commit.uuid,
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

    it('should return error when trying to create trigger on draft commit', async () => {
      // Arrange
      const params = {
        projectId: commit.projectId,
        versionUuid: 'draft-commit-uuid',
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
        'Cannot create triggers on a draft commit',
      )
    })
  })

  describe('pipedream environment errors', () => {
    it('should return error when pipedream environment is not configured', async () => {
      // Arrange
      const params = {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          conversations: ['AABBBCCCDDD'],
        },
      }

      const environmentError = new UnauthorizedError(
        'Pipedream environment not configured',
      )
      mockGetPipedreamEnvironment.mockReturnValue(
        Result.error(environmentError),
      )

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(environmentError)
    })
  })

  describe('integration errors', () => {
    it('should return error when integration is not found', async () => {
      // Arrange
      const params = {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: 999,
        configuration: {
          conversations: ['AABBBCCCDDD'],
        },
      }

      const integrationError = new NotFoundError('Integration not found')
      vi.spyOn(IntegrationsRepository.prototype, 'find').mockResolvedValue(
        Result.error(integrationError),
      )

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
        projectId: commit.projectId,
        versionUuid: commit.uuid,
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

      vi.spyOn(IntegrationsRepository.prototype, 'find').mockResolvedValue(
        Result.ok(integration),
      )

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(false)
      expect(result.error).toBe(validationError)
    })
  })

  describe('edge cases', () => {
    it('should handle versionUuid as "live"', async () => {
      // Arrange
      const params = {
        projectId: commit.projectId,
        versionUuid: 'live',
        componentId: 'slack-new-message',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          conversations: ['AABBBCCCDDD'],
        },
      }

      vi.spyOn(IntegrationsRepository.prototype, 'find').mockResolvedValue(
        Result.ok(integration),
      )

      // Act
      const result = await validateTriggerSchema(params, context)

      // Assert
      expect(Result.isOk(result)).toBe(true)
    })

    it('should pass correct parameters to validateLattesChoices', async () => {
      // Arrange
      const params = {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        componentId: 'custom-component',
        promptUuid: documents[0]!.documentUuid,
        integrationId: integration.id,
        configuration: {
          customProp: 'customValue',
          anotherProp: 123,
        },
      }

      vi.spyOn(IntegrationsRepository.prototype, 'find').mockResolvedValue(
        Result.ok(integration),
      )

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
