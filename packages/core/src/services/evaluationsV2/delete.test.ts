import { desc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  Commit,
  EvaluationV2,
  Project,
  User,
  Workspace,
} from '../../schema/types'
import {
  EvaluationType,
  Providers,
  RuleEvaluationMetric,
} from '@latitude-data/constants'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import * as repositories from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import * as factories from '../../tests/factories'
import { deleteEvaluationV2 } from './delete'
import { updateEvaluationV2 } from './update'

describe('deleteEvaluationV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let project: Project
  let user: User
  let commit: Commit
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
    })

    workspace = w
    project = p
    user = u
    commit = c
    const document = documents[0]!

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

  it('fails when evaluation deletion fails', async () => {
    mocks.publisher.mockClear()

    vi.spyOn(repositories, 'EvaluationsV2Repository').mockReturnValue({
      existsAnotherVersion: () =>
        // @ts-expect-error mock
        Promise.resolve(Result.error(new Error('evaluation deletion error'))),
    })

    await expect(
      deleteEvaluationV2({
        evaluation: evaluation,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new Error('evaluation deletion error'))

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('succeeds when deleting an evaluation without another version', async () => {
    mocks.publisher.mockClear()

    const { evaluation: deletedEvaluation } = await deleteEvaluationV2({
      evaluation: evaluation,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(deletedEvaluation).toEqual({
      ...evaluation,
      updatedAt: expect.any(Date),
      deletedAt: expect.any(Date),
    })
    expect(
      await database
        .select()
        .from(evaluationVersions)
        .where(eq(evaluationVersions.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationVersions.deletedAt)),
    ).toEqual([])
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Deleted',
      data: {
        evaluation: deletedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('succeeds when deleting an evaluation with another version in this commit', async () => {
    const { commit: draft } = await factories.createDraft({ project, user })
    const { evaluation: updatedEvaluation } = await updateEvaluationV2({
      evaluation: evaluation,
      commit: draft,
      settings: { name: 'updated evaluation' },
      workspace,
    }).then((r) => r.unwrap())

    mocks.publisher.mockClear()

    const { evaluation: deletedEvaluation } = await deleteEvaluationV2({
      evaluation: updatedEvaluation,
      commit: draft,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(deletedEvaluation).toEqual({
      ...updatedEvaluation,
      updatedAt: expect.any(Date),
      deletedAt: expect.any(Date),
    })
    expect(
      await database
        .select()
        .from(evaluationVersions)
        .where(eq(evaluationVersions.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationVersions.deletedAt)),
    ).toEqual([
      expect.objectContaining({
        id: evaluation.versionId,
        commitId: commit.id,
        deletedAt: null,
      }),
      expect.objectContaining({
        id: updatedEvaluation.versionId,
        commitId: draft.id,
        deletedAt: expect.any(Date),
      }),
    ])
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Deleted',
      data: {
        evaluation: deletedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })

  it('succeeds when deleting an evaluation with another version in other commit', async () => {
    const { commit: draft } = await factories.createDraft({ project, user })

    mocks.publisher.mockClear()

    const { evaluation: deletedEvaluation } = await deleteEvaluationV2({
      evaluation: evaluation,
      commit: draft,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(deletedEvaluation).toEqual({
      ...evaluation,
      id: deletedEvaluation.versionId,
      versionId: deletedEvaluation.versionId,
      commitId: draft.id,
      updatedAt: expect.any(Date),
      deletedAt: expect.any(Date),
    })
    expect(
      await database
        .select()
        .from(evaluationVersions)
        .where(eq(evaluationVersions.evaluationUuid, evaluation.uuid))
        .orderBy(desc(evaluationVersions.deletedAt)),
    ).toEqual([
      expect.objectContaining({
        id: evaluation.versionId,
        commitId: commit.id,
        deletedAt: null,
      }),
      expect.objectContaining({
        id: deletedEvaluation.versionId,
        commitId: draft.id,
        deletedAt: expect.any(Date),
      }),
    ])
    expect(mocks.publisher).toHaveBeenCalledExactlyOnceWith({
      type: 'evaluationV2Deleted',
      data: {
        evaluation: deletedEvaluation,
        workspaceId: workspace.id,
      },
    })
  })
})
