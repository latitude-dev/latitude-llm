import * as factories from '@latitude-data/core/factories'
import {
  DocumentTriggerParameters,
  DocumentTriggerType,
  DocumentVersion,
  Providers,
} from '@latitude-data/constants'
import { describe, expect, beforeEach, it, vi } from 'vitest'
import { Commit, Workspace } from '../../../../../../browser'
import { LatteTriggerAction } from '../../../../../../../../constants/src/latte/triggers'
import {
  EmailTriggerConfiguration,
  InsertScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import executeTriggerActions from './executeTriggerActions'
import { NotFoundError } from '@latitude-data/constants/errors'
import * as createDocumentTriggersModule from '../../../../../documentTriggers/create'
import * as deleteDocumentTriggersModule from '../../../../../documentTriggers/delete'
import * as updateDocumentTriggersModule from '../../../../../documentTriggers/update'
import { Result } from '../../../../../../lib/Result'

describe('Latte CRUD document triggers', () => {
  let workspace: Workspace
  let commit: Commit
  let documents: DocumentVersion[]
  let promptUuid: string
  let action: LatteTriggerAction

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
    promptUuid = documents[0]!.documentUuid
    vi.restoreAllMocks()
  })

  describe('when creating a document trigger', () => {
    it('should create a document trigger', async () => {
      // Arrange
      action = {
        operation: 'create',
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Test Email Trigger',
          replyWithResponse: true,
          emailWhitelist: ['manuel@latitude.so'],
          domainWhitelist: ['latitude.so'],
          parameters: {
            'Test Subject': DocumentTriggerParameters.Subject,
            'Test Body': DocumentTriggerParameters.Body,
            'Test Sender Email': DocumentTriggerParameters.SenderEmail,
            'Test Sender Name': DocumentTriggerParameters.SenderName,
          },
        } as EmailTriggerConfiguration,
      } as LatteTriggerAction

      const expectedLatteTriggerChanges = {
        projectId: commit.projectId,
        draftUuid: commit.uuid,
        promptUuid: promptUuid,
        triggerType: DocumentTriggerType.Email,
      }

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      })

      // Assert
      expect(result.ok).toBe(true)
      expect(result.value).toEqual(expectedLatteTriggerChanges)
    })

    it('should handle document not found when creating a trigger', async () => {
      // Arrange
      action = {
        operation: 'create',
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Test Email Trigger',
          replyWithResponse: true,
        } as EmailTriggerConfiguration,
      } as LatteTriggerAction

      const expectedError = new NotFoundError(
        `Document with UUID 00000000-0000-0000-0000-000000000000 not found in commit ${commit.uuid}.`,
      )

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
        documents,
        action,
      })

      // Assert
      expect(result.ok).toBe(false)
      expect(result.error).toStrictEqual(expectedError)
    })

    it('should throw an error if creating a trigger fails', async () => {
      // Arrange
      action = {
        operation: 'create',
        triggerType: DocumentTriggerType.Scheduled,
        configuration: {
          cronExpression: '* * * 9 0',
        } as InsertScheduledTriggerConfiguration,
      } as LatteTriggerAction

      const expectedError = new Error('Failed to create scheduled trigger')
      const expectedResultError = Result.error(expectedError)

      vi.spyOn(
        createDocumentTriggersModule,
        'createDocumentTrigger',
      ).mockResolvedValue(expectedResultError)

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      })

      // Assert
      expect(result.ok).toBe(false)
      expect(result.error).toStrictEqual(expectedError)
    })
  })

  describe('when deleting a document trigger', () => {
    beforeEach(async () => {
      action = {
        operation: 'create',
        triggerType: DocumentTriggerType.Email,
        configuration: {
          name: 'Test Email Trigger',
          replyWithResponse: true,
        } as EmailTriggerConfiguration,
      } as LatteTriggerAction

      await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      }).then((r) => r.unwrap())
    })

    it('should delete a document trigger', async () => {
      // Arrange
      action = {
        operation: 'delete',
        triggerType: DocumentTriggerType.Email,
      } as LatteTriggerAction

      const expectedLatteTriggerChanges = {
        projectId: commit.projectId,
        draftUuid: commit.uuid,
        promptUuid: promptUuid,
        triggerType: DocumentTriggerType.Email,
      }

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      })

      // Assert
      expect(result.ok).toBe(true)
      expect(result.value).toStrictEqual(expectedLatteTriggerChanges)
    })

    it('should handle document not found when deleting a trigger', async () => {
      // Arrange
      action = {
        operation: 'delete',
        triggerType: DocumentTriggerType.Email,
      } as LatteTriggerAction

      const expectedError = new NotFoundError(
        `Document with UUID 00000000-0000-0000-0000-000000000000 has no document triggers.`,
      )

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
        documents,
        action,
      })

      // Assert
      expect(result.ok).toBe(false)
      expect(result.error).toStrictEqual(expectedError)
    })

    it('should throw an error if deleting a trigger fails', async () => {
      // Arrange
      action = {
        operation: 'delete',
        triggerType: DocumentTriggerType.Email,
      } as LatteTriggerAction
      const expectedError = new Error('Failed to delete document trigger')
      const expectedResultError = Result.error(expectedError)
      vi.spyOn(
        deleteDocumentTriggersModule,
        'deleteDocumentTrigger',
      ).mockResolvedValue(expectedResultError)
      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      })
      // Assert
      expect(result.ok).toBe(false)
      expect(result.error).toStrictEqual(expectedError)
    })

    it('should throw error if deleting email trigger that does not exist but integration triggers do', async () => {
      // Arrange
      action = {
        operation: 'delete',
        triggerType: DocumentTriggerType.Scheduled,
      } as LatteTriggerAction

      const expectedError = new NotFoundError(
        `scheduled trigger not found for document with UUID ${promptUuid}.`,
      )

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      })

      // Assert
      expect(result.error).toStrictEqual(expectedError)
    })

    it('should throw error if deleting an integration trigger that doesnt exist, but another integration trigger does', async () => {
      // Arrange
      await factories.createIntegrationDocumentTrigger({
        workspaceId: workspace.id,
        documentUuid: promptUuid,
        integrationId: 123456789,
        properties: {
          componentId: 'test-component',
          payloadParameters: [],
        },
      })

      action = {
        operation: 'delete',
        triggerType: DocumentTriggerType.Integration,
        configuration: {
          componentId: 'non-existent-component-id',
          integrationId: 112312312,
          payloadParameters: [],
        },
      } as LatteTriggerAction
      const expectedError = new NotFoundError(
        `Integration trigger with ID 112312312 not found for document with UUID ${promptUuid}.`,
      )

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      })

      // Assert
      expect(result.ok).toBe(false)
      expect(result.error).toStrictEqual(expectedError)
    })
  })

  describe('when updating a document trigger', () => {
    beforeEach(async () => {
      action = {
        operation: 'create',
        triggerType: DocumentTriggerType.Scheduled,
        configuration: {
          cronExpression: '0 * * * *',
        } as InsertScheduledTriggerConfiguration,
      } as LatteTriggerAction

      await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      }).then((r) => r.unwrap())
    })

    it('should update a document trigger', async () => {
      // Arrange
      action = {
        operation: 'update',
        triggerType: DocumentTriggerType.Scheduled,
        configuration: {
          cronExpression: '0 0 0 0 0',
        } as InsertScheduledTriggerConfiguration,
      } as LatteTriggerAction

      const expectedLatteTriggerChanges = {
        projectId: commit.projectId,
        draftUuid: commit.uuid,
        promptUuid: promptUuid,
        triggerType: DocumentTriggerType.Scheduled,
      }

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid,
        documents,
        action,
      })

      // Assert
      expect(result.ok).toBe(true)
      expect(result.value).toStrictEqual(expectedLatteTriggerChanges)
    })

    it('should handle document not found when updating a trigger', async () => {
      // Arrange
      action = {
        operation: 'update',
        triggerType: DocumentTriggerType.Scheduled,
        configuration: {
          cronExpression: '0 0 0 0 0',
        } as InsertScheduledTriggerConfiguration,
      } as LatteTriggerAction

      const expectedError = new NotFoundError(
        `Document with UUID 00000000-0000-0000-0000-000000000000 has no document triggers.`,
      )

      // Act
      const result = await executeTriggerActions({
        workspace,
        commit,
        promptUuid: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
        documents,
        action,
      })

      // Assert
      expect(result.ok).toBe(false)
      expect(result.error).toStrictEqual(expectedError)
    })
  })

  it('should throw an error if updating a trigger fails', async () => {
    // Arrange
    action = {
      operation: 'update',
      triggerType: DocumentTriggerType.Scheduled,
      configuration: {
        cronExpression: '0 0 0 0 0',
      } as InsertScheduledTriggerConfiguration,
    } as LatteTriggerAction

    const expectedError = new NotFoundError(
      `Document with UUID ${promptUuid} has no document triggers.`,
    )

    const expectedResultError = Result.error(expectedError)

    vi.spyOn(
      updateDocumentTriggersModule,
      'updateDocumentTriggerConfiguration',
    ).mockResolvedValue(expectedResultError)

    // Act
    const result = await executeTriggerActions({
      workspace,
      commit,
      promptUuid,
      documents,
      action,
    })
    // Assert
    expect(result.ok).toBe(false)
    expect(result.error).toStrictEqual(expectedError)
  })
})
