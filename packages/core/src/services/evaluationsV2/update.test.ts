import { Providers } from '@latitude-data/constants'
import { desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { database } from '../../client'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  RuleEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits'
import { updateEvaluationV2 } from './update'

describe('updateEvaluationV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let project: Project
  let user: User
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      project: p,
      user: u,
      documents,
      commit: c,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
      skipMerge: true,
    })

    workspace = w
    project = p
    user = u
    commit = c
    document = documents[0]!

    evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
    })

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  it('fails when settings are changed in a merged commit', async () => {
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    mocks.publisher.mockClear()

    await expect(
      updateEvaluationV2({
        evaluation: evaluation,
        commit: commit,
        settings: {
          name: 'new name',
        },
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Cannot modify a merged commit'))

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when validation fails', async () => {
    mocks.publisher.mockClear()

    await expect(
      updateEvaluationV2({
        evaluation: evaluation,
        commit: commit,
        settings: {
          name: '',
        },
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Name is required'))

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('succeeds when updating an evaluation in draft commit', async () => {
    mocks.publisher.mockClear()

    const { evaluation: updatedEvaluation } = await updateEvaluationV2({
      evaluation: evaluation,
      commit: commit,
      settings: {
        name: 'new name',
      },
      options: {
        enableSuggestions: false,
      },
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(updatedEvaluation).toEqual(
      expect.objectContaining({
        ...evaluation,
        name: 'new name',
        enableSuggestions: false,
        updatedAt: expect.any(Date),
      }),
    )
    expect(
      await database
        .select()
        .from(evaluationVersions)
        .where(eq(evaluationVersions.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationVersions.updatedAt)),
    ).toEqual([
      expect.objectContaining({
        id: evaluation.versionId,
        commitId: commit.id,
        updatedAt: expect.any(Date),
      }),
    ])
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Updated',
      data: {
        evaluation: updatedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('succeeds when updating an evaluation in merged commit', async () => {
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    mocks.publisher.mockClear()

    const { evaluation: updatedEvaluation } = await updateEvaluationV2({
      evaluation: evaluation,
      commit: commit,
      options: {
        enableSuggestions: false,
      },
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(updatedEvaluation).toEqual(
      expect.objectContaining({
        ...evaluation,
        enableSuggestions: false,
        updatedAt: expect.any(Date),
      }),
    )
    expect(
      await database
        .select()
        .from(evaluationVersions)
        .where(eq(evaluationVersions.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationVersions.updatedAt)),
    ).toEqual([
      expect.objectContaining({
        id: evaluation.versionId,
        commitId: commit.id,
        updatedAt: expect.any(Date),
      }),
    ])
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Updated',
      data: {
        evaluation: updatedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('succeeds when updating an evaluation in other commit', async () => {
    commit = await mergeCommit(commit).then((r) => r.unwrap())
    const { commit: draft } = await factories.createDraft({ project, user })

    mocks.publisher.mockClear()

    const { evaluation: updatedEvaluation } = await updateEvaluationV2({
      evaluation: evaluation,
      commit: draft,
      settings: {
        name: 'new name',
      },
      options: {
        enableSuggestions: false,
      },
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(updatedEvaluation).toEqual(
      expect.objectContaining({
        ...evaluation,
        id: updatedEvaluation.versionId,
        versionId: updatedEvaluation.versionId,
        commitId: draft.id,
        name: 'new name',
        enableSuggestions: false,
        updatedAt: expect.any(Date),
      }),
    )
    expect(
      await database
        .select()
        .from(evaluationVersions)
        .where(eq(evaluationVersions.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationVersions.updatedAt)),
    ).toEqual([
      expect.objectContaining({
        id: updatedEvaluation.versionId,
        commitId: draft.id,
        name: updatedEvaluation.name,
        enableSuggestions: updatedEvaluation.enableSuggestions,
        updatedAt: expect.any(Date),
      }),
      expect.objectContaining({
        id: evaluation.versionId,
        commitId: commit.id,
        name: evaluation.name,
        enableSuggestions: evaluation.enableSuggestions,
        updatedAt: expect.any(Date),
      }),
    ])
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Updated',
      data: {
        evaluation: updatedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('succeeds when updating alignmentMetric', async () => {
    mocks.publisher.mockClear()

    const { evaluation: updatedEvaluation } = await updateEvaluationV2({
      evaluation: evaluation,
      commit: commit,
      workspace: workspace,
      alignmentMetric: 85,
    }).then((r) => r.unwrap())

    const dbEvaluation = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.evaluationUuid, evaluation.uuid))
      .orderBy(desc(evaluationVersions.updatedAt))
      .then((r) => r[0]!)

    expect(dbEvaluation.alignmentMetric).toBe(85)
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Updated',
      data: {
        evaluation: updatedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('preserves existing issueId when not provided', async () => {
    const { issue } = await factories.createIssue({
      document: document,
      workspace: workspace,
      project: project,
    })

    // Create evaluation with issueId using the create service directly
    // Use LLM Binary evaluation as it doesn't require expected output
    const { createEvaluationV2: createEval } = await import('./create')
    const createResult = await createEval({
      document: document,
      commit: commit,
      workspace: workspace,
      settings: {
        name: 'test evaluation',
        description: 'test',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          provider: 'openai',
          model: 'gpt-4o',
          criteria: 'test criteria',
          passDescription: 'pass',
          failDescription: 'fail',
        },
      },
      options: {
        evaluateLiveLogs: true,
      },
      issueId: issue.id,
    }).then((r) => r.unwrap())

    const evaluationWithIssue = createResult.evaluation

    mocks.publisher.mockClear()

    const { evaluation: updatedEvaluation } = await updateEvaluationV2({
      evaluation: evaluationWithIssue,
      commit: commit,
      workspace: workspace,
      settings: {
        name: 'updated name',
      },
    }).then((r) => r.unwrap())

    const dbEvaluation = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.evaluationUuid, evaluationWithIssue.uuid))
      .orderBy(desc(evaluationVersions.updatedAt))
      .then((r) => r[0]!)

    expect(dbEvaluation.issueId).toBe(issue.id)
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Updated',
      data: {
        evaluation: updatedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('updates issueId when explicitly provided', async () => {
    const { issue: issue1 } = await factories.createIssue({
      document: document,
      workspace: workspace,
      project: project,
    })

    const { issue: issue2 } = await factories.createIssue({
      document: document,
      workspace: workspace,
      project: project,
    })

    // Create evaluation with issueId using the create service directly
    // Use LLM Binary evaluation as it doesn't require expected output
    const { createEvaluationV2: createEval } = await import('./create')
    const createResult = await createEval({
      document: document,
      commit: commit,
      workspace: workspace,
      settings: {
        name: 'test evaluation',
        description: 'test',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          provider: 'openai',
          model: 'gpt-4o',
          criteria: 'test criteria',
          passDescription: 'pass',
          failDescription: 'fail',
        },
      },
      options: {
        evaluateLiveLogs: true,
      },
      issueId: issue1.id,
    }).then((r) => r.unwrap())

    const evaluationWithIssue = createResult.evaluation

    mocks.publisher.mockClear()

    const { evaluation: updatedEvaluation } = await updateEvaluationV2({
      evaluation: evaluationWithIssue,
      commit: commit,
      workspace: workspace,
      issueId: issue2.id,
    }).then((r) => r.unwrap())

    const dbEvaluation = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.evaluationUuid, evaluationWithIssue.uuid))
      .orderBy(desc(evaluationVersions.updatedAt))
      .then((r) => r[0]!)

    expect(dbEvaluation.issueId).toBe(issue2.id)
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Updated',
      data: {
        evaluation: updatedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('removes issueId when explicitly set to null', async () => {
    const { issue } = await factories.createIssue({
      document: document,
      workspace: workspace,
      project: project,
    })

    // Create evaluation with issueId using the create service directly
    // Use LLM Binary evaluation as it doesn't require expected output
    const { createEvaluationV2: createEval } = await import('./create')
    const createResult = await createEval({
      document: document,
      commit: commit,
      workspace: workspace,
      settings: {
        name: 'test evaluation',
        description: 'test',
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          provider: 'openai',
          model: 'gpt-4o',
          criteria: 'test criteria',
          passDescription: 'pass',
          failDescription: 'fail',
        },
      },
      options: {
        evaluateLiveLogs: true,
      },
      issueId: issue.id,
    }).then((r) => r.unwrap())

    const evaluationWithIssue = createResult.evaluation

    mocks.publisher.mockClear()

    const { evaluation: updatedEvaluation } = await updateEvaluationV2({
      evaluation: evaluationWithIssue,
      commit: commit,
      workspace: workspace,
      issueId: null,
    }).then((r) => r.unwrap())

    const dbEvaluation = await database
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.evaluationUuid, evaluationWithIssue.uuid))
      .orderBy(desc(evaluationVersions.updatedAt))
      .then((r) => r[0]!)

    expect(dbEvaluation.issueId).toBeNull()
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Updated',
      data: {
        evaluation: updatedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })
})
