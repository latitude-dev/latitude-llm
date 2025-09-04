import * as factories from '@latitude-data/core/factories'
import {
  DocumentTriggerType,
  DocumentVersion,
  Providers,
} from '@latitude-data/constants'
import { describe, expect, beforeEach, it, vi } from 'vitest'
import { Commit, Workspace } from '../../../../../../browser'
import { EmailTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { NotFoundError } from '@latitude-data/constants/errors'
import * as deleteDocumentTriggersModule from '../../../../../documentTriggers/delete'
import { Result } from '../../../../../../lib/Result'
import createTrigger from './createTrigger'
import { LatteToolContext } from '../../types'
import deleteTrigger from './deleteTrigger'

describe('Latte delete document triggers', () => {
  let workspace: Workspace
  let commit: Commit
  let documents: DocumentVersion[]
  let promptUuid: string
  let triggerSpecification

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
      skipMerge: true,
    })
    workspace = project.workspace
    commit = project.commit
    documents = project.documents
    promptUuid = documents[0]!.documentUuid

    triggerSpecification = {
      triggerType: DocumentTriggerType.Email as const,
      configuration: {
        name: 'Test Email Trigger',
        replyWithResponse: true,
      } as EmailTriggerConfiguration,
    }

    await createTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid,
        triggerSpecification,
      },
      {
        workspace,
      } as LatteToolContext,
    )
    vi.restoreAllMocks()
  })

  it('should delete a document trigger', async () => {
    // Arrange
    triggerSpecification = {
      triggerType: DocumentTriggerType.Email as const,
    }

    const expectedLatteTriggerChanges = {
      projectId: commit.projectId,
      versionUuid: commit.uuid,
      promptUuid: promptUuid,
      triggerType: DocumentTriggerType.Email,
    }

    // Act
    const result = await deleteTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid,
        triggerSpecification,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toStrictEqual(expectedLatteTriggerChanges)
  })

  it('should handle document not found when deleting a trigger', async () => {
    // Arrange
    triggerSpecification = {
      triggerType: DocumentTriggerType.Email as const,
    }

    const expectedError = new NotFoundError(
      `Document with UUID 00000000-0000-0000-0000-000000000000 has no document triggers.`,
    )

    // Act
    const result = await deleteTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
        triggerSpecification,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    // Assert
    expect(result.ok).toBe(false)
    expect(result.error).toStrictEqual(expectedError)
  })

  it('should throw an error if deleting a trigger fails', async () => {
    // Arrange
    triggerSpecification = {
      triggerType: DocumentTriggerType.Email as const,
    }
    const expectedError = new Error('Failed to delete document trigger')
    const expectedResultError = Result.error(expectedError)
    vi.spyOn(
      deleteDocumentTriggersModule,
      'deleteDocumentTrigger',
    ).mockResolvedValue(expectedResultError)
    // Act
    const result = await deleteTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid,
        triggerSpecification,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toStrictEqual(expectedError)
  })

  it('should throw error if deleting email trigger that does not exist but integration triggers do', async () => {
    // Arrange
    triggerSpecification = {
      triggerType: DocumentTriggerType.Scheduled as const,
    }

    const expectedError = new NotFoundError(
      `scheduled trigger not found for document with UUID ${promptUuid}.`,
    )

    // Act
    const result = await deleteTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid,
        triggerSpecification,
      },
      {
        workspace,
      } as LatteToolContext,
    )

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

    triggerSpecification = {
      triggerType: DocumentTriggerType.Integration as const,
      configuration: {
        componentId: 'non-existent-component-id',
        integrationId: 112312312,
        payloadParameters: [],
      },
    }
    const expectedError = new NotFoundError(
      `Integration trigger with ID 112312312 not found for document with UUID ${promptUuid}.`,
    )

    // Act
    const result = await deleteTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid,
        triggerSpecification,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toStrictEqual(expectedError)
  })
})
