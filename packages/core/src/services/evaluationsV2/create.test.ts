import { Providers } from '@latitude-data/constants'
import { desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { database } from '../../client'
import {
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  RuleEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { createEvaluationV2 } from './create'
import { Project } from '../../schema/models/types/Project'

describe('createEvaluationV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let commit: Commit
  let project: Project
  let document: DocumentVersion
  let settings: EvaluationSettings<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let options: EvaluationOptions
  let issueId: number | null

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      documents,
      commit: c,
      project: p,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    workspace = w
    commit = c
    project = p
    document = documents[0]!

    settings = {
      name: 'name',
      description: 'description',
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.ExactMatch,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        caseInsensitive: false,
      },
    }
    options = {
      evaluateLiveLogs: false,
      enableSuggestions: true,
      autoApplySuggestions: true,
    }
    issueId = null

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  it('fails when validation fails', async () => {
    mocks.publisher.mockClear()

    await expect(
      createEvaluationV2({
        document: document,
        commit: commit,
        settings: {
          ...settings,
          name: '',
        },
        options: options,
        issueId,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Name is required'))

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('succeeds when creating an evaluation', async () => {
    mocks.publisher.mockClear()
    const { issue: creatingActiveIssue } = await factories.createIssue({
      title: 'title',
      description: 'description',
      document: document,
      project,
      workspace: workspace,
    })
    issueId = creatingActiveIssue.id

    const { evaluation } = await createEvaluationV2({
      document: document,
      commit: commit,
      settings: settings,
      options: options,
      issueId,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(evaluation).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        issueId,
        ...settings,
        ...options,
      }),
    )
    expect(
      await database
        .select()
        .from(evaluationVersions)
        .where(eq(evaluationVersions.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationVersions.createdAt)),
    ).toEqual([
      expect.objectContaining({
        id: evaluation.versionId,
        commitId: commit.id,
        issueId,
        createdAt: expect.any(Date),
      }),
    ])
    expect(mocks.publisher).toHaveBeenCalledWith({
      type: 'evaluationV2Created',
      data: {
        evaluation: evaluation,
        workspaceId: workspace.id,
      },
    })
  })
})
