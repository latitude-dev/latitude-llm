import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DocumentTriggerType,
  DocumentVersion,
  Providers,
} from '@latitude-data/constants'
import { Commit, Project, Workspace } from '../../schema/types'
import { createDocumentTrigger } from './create'
import { BadRequestError, LatitudeError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits'
import { Result } from '../../lib/Result'
import {
  EmailTriggerConfiguration,
  ScheduledTriggerConfiguration,
  IntegrationTriggerConfiguration,
  EmailTriggerDeploymentSettings,
  ScheduledTriggerDeploymentSettings,
  IntegrationTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { DocumentTriggersRepository } from '../../repositories'

const mocks = vi.hoisted(() => ({
  deployDocumentTrigger: vi.fn(),
  publisher: {
    publishLater: vi.fn(),
  },
}))

vi.mock('./deploy', () => ({
  deployDocumentTrigger: mocks.deployDocumentTrigger,
}))

vi.mock('../../events/publisher', () => ({
  publisher: mocks.publisher,
}))

describe('createDocumentTrigger', () => {
  let workspace: Workspace
  let project: Project
  let draft: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()

    const {
      workspace: w,
      project: p,
      commit: c,
      documents,
    } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        foo: factories.helpers.createPrompt({ provider: 'openai' }),
      },
      skipMerge: true,
    })

    workspace = w
    project = p
    draft = c
    document = documents[0]!
  })

  describe('when commit is merged', () => {
    it('returns error when trying to create trigger in merged commit', async () => {
      // Arrange
      const commit = await mergeCommit(draft).then((r) => r.unwrap())

      // Act
      const result = await createDocumentTrigger({
        workspace,
        project,
        commit,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: {
          emailWhitelist: ['test@example.com'],
          replyWithResponse: true,
        },
      })

      // Assert
      expect(result.ok).toBeFalsy()
      expect(result.error).toBeInstanceOf(BadRequestError)
      expect(result.error?.message).toBe(
        'Cannot create document trigger in a merged commit',
      )
      expect(mocks.deployDocumentTrigger).not.toHaveBeenCalled()
    })
  })

  describe('when deployment fails', () => {
    it('returns deployment error without creating database record', async () => {
      // Arrange
      const deploymentError = new LatitudeError('Deployment failed')
      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.error(deploymentError),
      )

      // Act
      const result = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: {
          cronExpression: '0 0 * * *',
        },
      })

      const triggersScoppe = new DocumentTriggersRepository(workspace.id)
      const triggers = await triggersScoppe
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: draft,
        })
        .then((r) => r.unwrap())

      // Assert
      expect(result.ok).toBeFalsy()
      expect(result.error).toBe(deploymentError)
      expect(mocks.deployDocumentTrigger).toHaveBeenCalledWith(
        {
          workspace,
          commit: draft,
          triggerUuid: expect.any(String),
          triggerType: DocumentTriggerType.Scheduled,
          configuration: { cronExpression: '0 0 * * *' },
          skipDeployment: false,
        },
        expect.any(Object), // transaction
      )

      expect(triggers).toHaveLength(0) // No trigger should be created
    })
  })

  describe('successful email trigger creation', () => {
    it('creates email trigger with correct configuration', async () => {
      // Arrange
      const emailConfig: EmailTriggerConfiguration = {
        name: 'Test Email Trigger',
        emailWhitelist: ['test@example.com'],
        domainWhitelist: ['example.com'],
        replyWithResponse: true,
        parameters: {},
      }
      const deploymentSettings: EmailTriggerDeploymentSettings = {}

      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings,
          triggerStatus: 'deployed',
        }),
      )

      // Act
      const result = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: emailConfig,
      })

      const triggersScoppe = new DocumentTriggersRepository(workspace.id)
      const triggers = await triggersScoppe
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: draft,
        })
        .then((r) => r.unwrap())

      const trigger = triggers[0]!

      // Assert
      expect(result.ok).toBeTruthy()
      expect(trigger).toBeDefined()
      expect(trigger.workspaceId).toBe(workspace.id)
      expect(trigger.projectId).toBe(project.id)
      expect(trigger.commitId).toBe(draft.id)
      expect(trigger.documentUuid).toBe(document.documentUuid)
      expect(trigger.triggerType).toBe(DocumentTriggerType.Email)
      expect(trigger.configuration).toEqual(emailConfig)
      expect(trigger.deploymentSettings).toEqual(deploymentSettings)
    })
  })

  describe('successful scheduled trigger creation', () => {
    it('creates scheduled trigger with correct configuration', async () => {
      // Arrange
      const scheduledConfig: ScheduledTriggerConfiguration = {
        cronExpression: '0 9 * * MON-FRI',
      }
      const deploymentSettings: ScheduledTriggerDeploymentSettings = {
        lastRun: new Date('2023-01-01T09:00:00Z'),
        nextRunTime: new Date('2023-01-02T09:00:00Z'),
      }

      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings,
          triggerStatus: 'deployed',
        }),
      )

      // Act
      const result = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Scheduled,
        configuration: scheduledConfig,
      })

      const triggersScoppe = new DocumentTriggersRepository(workspace.id)
      const triggers = await triggersScoppe
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: draft,
        })
        .then((r) => r.unwrap())

      const trigger = triggers[0]!

      // Assert
      expect(result.ok).toBeTruthy()
      expect(trigger).toBeDefined()
      expect(trigger.workspaceId).toBe(workspace.id)
      expect(trigger.projectId).toBe(project.id)
      expect(trigger.commitId).toBe(draft.id)
      expect(trigger.documentUuid).toBe(document.documentUuid)
      expect(trigger.triggerType).toBe(DocumentTriggerType.Scheduled)
      expect(trigger.configuration).toEqual(scheduledConfig)
      // Database serializes dates as ISO strings
      expect(trigger.deploymentSettings).toEqual({
        lastRun: '2023-01-01T09:00:00.000Z',
        nextRunTime: '2023-01-02T09:00:00.000Z',
      })
    })
  })

  describe('successful integration trigger creation', () => {
    it('creates integration trigger with correct configuration', async () => {
      // Arrange
      const integrationConfig: IntegrationTriggerConfiguration = {
        integrationId: 123,
        componentId: 'webhook-component',
        properties: { url: 'https://api.example.com/webhook' },
        payloadParameters: ['param1', 'param2'],
      }
      const deploymentSettings: IntegrationTriggerDeploymentSettings = {
        triggerId: 'external-trigger-id-456',
      }

      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings,
          triggerStatus: 'deployed',
        }),
      )

      // Act
      const result = await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Integration,
        configuration: integrationConfig,
      })

      const triggersScoppe = new DocumentTriggersRepository(workspace.id)
      const triggers = await triggersScoppe
        .getTriggersInDocument({
          documentUuid: document.documentUuid,
          commit: draft,
        })
        .then((r) => r.unwrap())

      const trigger = triggers[0]!

      // Assert
      expect(result.ok).toBeTruthy()
      expect(trigger).toBeDefined()
      expect(trigger.workspaceId).toBe(workspace.id)
      expect(trigger.projectId).toBe(project.id)
      expect(trigger.commitId).toBe(draft.id)
      expect(trigger.documentUuid).toBe(document.documentUuid)
      expect(trigger.triggerType).toBe(DocumentTriggerType.Integration)
      expect(trigger.configuration).toEqual(integrationConfig)
      expect(trigger.deploymentSettings).toEqual(deploymentSettings)
    })
  })

  describe('event emission', () => {
    it('should emit documentTriggerCreated event when trigger is created successfully', async () => {
      // Arrange
      const emailConfig: EmailTriggerConfiguration = {
        name: 'Test Email Trigger',
        emailWhitelist: ['test@example.com'],
        domainWhitelist: ['example.com'],
        replyWithResponse: true,
        parameters: {},
      }
      const deploymentSettings: EmailTriggerDeploymentSettings = {}

      mocks.deployDocumentTrigger.mockResolvedValue(
        Result.ok({
          deploymentSettings,
          triggerStatus: 'deployed',
        }),
      )

      // Act
      await createDocumentTrigger({
        workspace,
        project,
        commit: draft,
        document,
        triggerType: DocumentTriggerType.Email,
        configuration: emailConfig,
      })

      // Assert
      expect(mocks.publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentTriggerCreated',
        data: {
          workspaceId: workspace.id,
          documentTrigger: expect.objectContaining({
            triggerType: DocumentTriggerType.Email,
            projectId: project.id,
            commitId: draft.id,
            documentUuid: document.documentUuid,
          }),
          project,
          commit: draft,
        },
      })
    })
  })
})
