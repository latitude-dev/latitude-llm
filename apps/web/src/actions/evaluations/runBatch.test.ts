import {
  Commit,
  Dataset,
  DocumentVersion,
  EvaluationDto,
  Project,
  ProviderApiKey,
  Providers,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runBatchAction } from './runBatch'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  queues: {
    defaultQueue: {
      jobs: {
        enqueueRunBatchEvaluationJob: vi.fn(),
      },
    },
    eventsQueue: {
      jobs: {
        enqueueCreateEventJob: vi.fn(),
        enqueuePublishEventJob: vi.fn(),
      },
    },
  },
}))

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@latitude-data/jobs', () => ({
  setupJobs: vi.fn().mockImplementation(() => mocks.queues),
}))

describe('runBatchAction', () => {
  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const [_, error] = await runBatchAction({
        datasetId: 1,
        projectId: 1,
        documentUuid: 'doc-uuid',
        commitUuid: 'commit-uuid',
        fromLine: 0,
        toLine: 5,
        evaluationIds: [1],
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    let workspace: Workspace,
      user: User,
      project: Project,
      document: DocumentVersion,
      commit: Commit,
      dataset: Dataset,
      evaluation: EvaluationDto,
      provider: ProviderApiKey

    beforeEach(async () => {
      vi.clearAllMocks()

      const setup = await factories.createProject({
        documents: { 'test-doc': 'Test content' },
      })
      workspace = setup.workspace
      user = setup.user
      project = setup.project
      document = setup.documents[0]!
      commit = setup.commit

      provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'Test Provider',
        user,
      })

      dataset = await factories
        .createDataset({
          name: 'Test Dataset',
          workspace,
          author: user,
        })
        .then((result) => result.dataset)

      evaluation = await factories.createEvaluation({
        provider,
        name: 'Test Evaluation',
      })

      mocks.getSession.mockReturnValue({
        user,
        workspace: { id: workspace.id, name: workspace.name },
      })
    })

    it('successfully enqueues a batch evaluation job', async () => {
      const [result, error] = await runBatchAction({
        datasetId: dataset.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        fromLine: 0,
        toLine: 5,
        evaluationIds: [evaluation.id],
      })

      expect(error).toBeNull()
      expect(result).toEqual({
        success: true,
      })

      expect(
        mocks.queues.defaultQueue.jobs.enqueueRunBatchEvaluationJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluation: expect.objectContaining({ id: evaluation.id }),
          dataset: expect.objectContaining({ id: dataset.id }),
          document: expect.objectContaining({
            documentUuid: document.documentUuid,
          }),
          fromLine: 0,
          toLine: 5,
          parametersMap: undefined,
          batchId: expect.any(String),
        }),
      )
    })

    it('handles optional parameters', async () => {
      const [result, error] = await runBatchAction({
        datasetId: dataset.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        fromLine: 10,
        toLine: 20,
        evaluationIds: [evaluation.id],
        parameters: { 1: 100, 2: 200 },
      })

      expect(error).toBeNull()
      expect(result).toEqual({
        success: true,
      })

      expect(
        mocks.queues.defaultQueue.jobs.enqueueRunBatchEvaluationJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          fromLine: 10,
          toLine: 20,
          parametersMap: { 1: 100, 2: 200 },
        }),
      )
    })

    it('handles errors when resources are not found', async () => {
      const [_, error] = await runBatchAction({
        datasetId: 999999,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        fromLine: 0,
        toLine: 5,
        evaluationIds: [evaluation.id],
      })

      expect(error).not.toBeNull()
      expect(error!.message).toContain('not found')
    })

    it('enqueues multiple evaluation jobs for multiple evaluationIds', async () => {
      const evaluation2 = await factories.createEvaluation({
        provider,
        name: 'Test Evaluation 2',
      })

      const [result, error] = await runBatchAction({
        datasetId: dataset.id,
        projectId: project.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        fromLine: 0,
        toLine: 5,
        evaluationIds: [evaluation.id, evaluation2.id],
      })

      expect(error).toBeNull()
      expect(result).toEqual({
        success: true,
      })

      expect(
        mocks.queues.defaultQueue.jobs.enqueueRunBatchEvaluationJob,
      ).toHaveBeenCalledTimes(2)

      expect(
        mocks.queues.defaultQueue.jobs.enqueueRunBatchEvaluationJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluation: expect.objectContaining({ id: evaluation.id }),
        }),
      )

      expect(
        mocks.queues.defaultQueue.jobs.enqueueRunBatchEvaluationJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluation: expect.objectContaining({ id: evaluation2.id }),
        }),
      )
    })
  })
})
