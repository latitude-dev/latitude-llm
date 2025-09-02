import * as factories from '@latitude-data/core/factories'
import {
  DocumentTriggerParameters,
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
import * as createDocumentTriggersModule from '../../../../../documentTriggers/create'
import { Result } from '../../../../../../lib/Result'
import createTrigger from './createTrigger'
import { CommitsRepository } from '../../../../../../repositories'
import { LatteToolContext } from '../../types'

const mockCommit = (mergedAt: boolean) => ({
  projectId: 1,
  uuid: 'commit-uuid',
  mergedAt,
})

describe('Latte create document triggers', () => {
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
      operation: 'create'
      triggerType: DocumentTriggerType.Email
      configuration: EmailTriggerConfiguration
    } = {
      operation: 'create',
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'Test Email Trigger',
        replyWithResponse: true,
      },
    }

    const result = await createTrigger(
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
      operation: 'create'
      triggerType: DocumentTriggerType.Email
      configuration: EmailTriggerConfiguration
    } = {
      operation: 'create',
      triggerType: DocumentTriggerType.Email,
      configuration: {
        name: 'Test Email Trigger',
        replyWithResponse: true,
      },
    }

    const result = await createTrigger(
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

  it('should create a document trigger', async () => {
    action = {
      operation: 'create' as const,
      triggerType: DocumentTriggerType.Email as const,
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
    }

    const expectedLatteTriggerChanges = {
      projectId: commit.projectId,
      versionUuid: commit.uuid,
      promptUuid: promptUuid,
      triggerType: DocumentTriggerType.Email,
    }

    const result = await createTrigger(
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

    expect(result.ok).toBe(true)
    expect(result.value).toEqual(expectedLatteTriggerChanges)
  })

  it('should handle document not found when creating a trigger', async () => {
    action = {
      operation: 'create' as const,
      triggerType: DocumentTriggerType.Email as const,
      configuration: {
        name: 'Test Email Trigger',
        replyWithResponse: true,
      } as EmailTriggerConfiguration,
    }

    const expectedError = new NotFoundError(
      `Document with UUID 00000000-0000-0000-0000-000000000000 not found in commit ${commit.uuid}.`,
    )

    const result = await createTrigger(
      {
        projectId: commit.projectId,
        versionUuid: commit.uuid,
        promptUuid: '00000000-0000-0000-0000-000000000000',
        action,
      },
      {
        workspace,
      } as LatteToolContext,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toStrictEqual(expectedError)
  })

  it('should throw an error if creating a trigger fails', async () => {
    action = {
      operation: 'create' as const,
      triggerType: DocumentTriggerType.Scheduled as const,
      configuration: {
        cronExpression: '* * * 9 0',
      } as ScheduledTriggerConfiguration,
    }

    const expectedError = new Error('Failed to create scheduled trigger')
    const expectedResultError = Result.error(expectedError)

    vi.spyOn(
      createDocumentTriggersModule,
      'createDocumentTrigger',
    ).mockResolvedValue(expectedResultError)

    const result = await createTrigger(
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

    expect(result.ok).toBe(false)
    expect(result.error).toStrictEqual(expectedError)
  })
})
