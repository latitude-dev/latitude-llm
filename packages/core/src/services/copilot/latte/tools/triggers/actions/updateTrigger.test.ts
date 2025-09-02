import * as factories from '@latitude-data/core/factories'
import {
  DocumentTriggerType,
  DocumentVersion,
  Providers,
} from '@latitude-data/constants'
import { describe, expect, beforeEach, it, vi } from 'vitest'
import { Commit, Workspace } from '../../../../../../browser'
import {
  EmailTriggerConfiguration,
  ScheduledTriggerConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import * as updateDocumentTriggersModule from '../../../../../documentTriggers/update'
import { Result } from '../../../../../../lib/Result'
import { CommitsRepository } from '../../../../../../repositories'
import updateTrigger from './updateTrigger'
import { LatteToolContext } from '../../types'
import createTrigger from './createTrigger'

const mockCommit = (mergedAt: boolean) => ({
  projectId: 1,
  uuid: 'commit-uuid',
  mergedAt,
})

describe('Latte update document triggers', () => {
  let workspace: Workspace
  let commit: Commit
  let documents: DocumentVersion[]
  let promptUuid: string
  let action

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

    action = {
      operation: 'create' as const,
      triggerType: DocumentTriggerType.Scheduled as const,
      configuration: {
        cronExpression: '0 * * * *',
      } as ScheduledTriggerConfiguration,
    }

    await createTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid,
        action,
      },
      {
        workspace,
      } as LatteToolContext,
    )
    vi.restoreAllMocks()
  })

  it('Returns error if commit is not found', async () => {
    vi.spyOn(
      CommitsRepository.prototype,
      'getCommitByUuid',
      // @ts-expect-error: mocking
    ).mockImplementationOnce(() => {
      return Promise.resolve({
        unwrap: () => mockCommit(true),
        ok: false,
      })
    })

    const action: {
      operation: 'update'
      triggerType: DocumentTriggerType.Email
      configuration: EmailTriggerConfiguration
    } = {
      operation: 'update',
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'Test Email Trigger',
        replyWithResponse: true,
      },
    }

    const result = await updateTrigger(
      {
        projectId: 1,
        versionUuid: 'commit-uuid',
        promptUuid: '1111-1111-1111-1111',
        action,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    expect(result.ok).toBe(false)
  })

  it('returns result error when commit is merged', async () => {
    const expectedError = new BadRequestError(
      `Cannot create document trigger in a merged commit`,
    )

    vi.spyOn(
      CommitsRepository.prototype,
      'getCommitByUuid',
      // @ts-expect-error: mocking
    ).mockImplementationOnce(() => {
      return Promise.resolve({
        unwrap: () => mockCommit(true),
        ok: true,
      })
    })

    const action: {
      operation: 'update'
      triggerType: DocumentTriggerType.Email
      configuration: EmailTriggerConfiguration
    } = {
      operation: 'update',
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'Test Email Trigger',
        replyWithResponse: true,
      },
    }

    const result = await updateTrigger(
      {
        projectId: 1,
        versionUuid: 'commit-uuid',
        promptUuid: '1111-1111-1111-1111',
        action,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toEqual(expectedError)
  })

  it('should update a document trigger', async () => {
    // Arrange
    action = {
      operation: 'update' as const,
      triggerType: DocumentTriggerType.Scheduled as const,
      configuration: {
        cronExpression: '0 0 0 0 0',
      } as ScheduledTriggerConfiguration,
    }

    const expectedLatteTriggerChanges = {
      projectId: commit.projectId,
      versionUuid: commit.uuid,
      promptUuid: promptUuid,
      triggerType: DocumentTriggerType.Scheduled,
    }

    // Act
    const result = await updateTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid,
        action,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    // Assert
    expect(result.ok).toBe(true)
    expect(result.value).toStrictEqual(expectedLatteTriggerChanges)
  })

  it('should handle document not found when updating a trigger', async () => {
    // Arrange
    action = {
      operation: 'update' as const,
      triggerType: DocumentTriggerType.Scheduled as const,
      configuration: {
        cronExpression: '0 0 0 0 0',
      } as ScheduledTriggerConfiguration,
    }

    const expectedError = new NotFoundError(
      `Document with UUID 00000000-0000-0000-0000-000000000000 has no document triggers.`,
    )

    // Act
    const result = await updateTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
        action,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    // Assert
    expect(result.ok).toBe(false)
    expect(result.error).toStrictEqual(expectedError)
  })

  it('should throw an error if updating a trigger fails', async () => {
    // Arrange
    action = {
      operation: 'update' as const,
      triggerType: DocumentTriggerType.Scheduled as const,
      configuration: {
        cronExpression: '0 0 0 0 0',
      } as ScheduledTriggerConfiguration,
    }

    const expectedError = new NotFoundError(
      `Document with UUID ${promptUuid} has no document triggers.`,
    )

    const expectedResultError = Result.error(expectedError)

    vi.spyOn(
      updateDocumentTriggersModule,
      'updateDocumentTriggerConfiguration',
    ).mockResolvedValue(expectedResultError)

    // Act
    const result = await updateTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid,
        action,
      },
      {
        workspace,
      } as LatteToolContext,
    )
    // Assert
    expect(result.ok).toBe(false)
    expect(result.error).toStrictEqual(expectedError)
  })
})
