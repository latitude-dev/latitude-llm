import { desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import {
  type Commit,
  type DocumentVersion,
  type EvaluationType,
  type EvaluationV2,
  type Project,
  Providers,
  type RuleEvaluationMetric,
  type User,
  type Workspace,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { evaluationVersions } from '../../schema'
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
  let evaluation: EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>

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
      publisher: vi.spyOn(publisher, 'publishLater').mockImplementation(async () => {}),
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
})
