import * as factories from '../../../tests/factories'
import { type DocumentVersion, type Experiment, Providers, type User } from '../../../browser'
import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runDocumentForExperimentJob } from './runDocumentForExperimentJob'
import * as runDocumentAtCommitWithAutoToolResponsesModule from '../documents/runDocumentAtCommitWithAutoToolResponses'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import * as shared from './shared'
import { completeExperiment } from '../../../services/experiments/complete'

describe('runDocumentForExperimentJob', () => {
  let user: User
  let document: DocumentVersion
  let mockJob: Job<any>
  let mockExperiment: Experiment
  let workspace: any
  let project: any
  let commit: any

  const datasetRowId = 42

  const mocks = vi.hoisted(() => ({
    runDocumentAtCommitWithAutoToolResponses: vi.fn(),
    updateExperimentStatus: vi.fn(),
  }))

  beforeEach(async () => {
    vi.clearAllMocks()

    vi.spyOn(
      runDocumentAtCommitWithAutoToolResponsesModule,
      'runDocumentAtCommitWithAutoToolResponses',
    ).mockImplementation(mocks.runDocumentAtCommitWithAutoToolResponses)
    vi.spyOn(shared, 'updateExperimentStatus').mockImplementation(mocks.updateExperimentStatus)

    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
      documents: {
        'test-doc': factories.helpers.createPrompt({ provider: 'Latitude' }),
      },
    })
    user = setup.user
    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!

    const evaluation = await factories.createEvaluationV2({
      workspace,
      document,
      commit,
    })

    const { experiment } = await factories.createExperiment({
      name: 'Test experiment',
      document,
      commit,
      evaluations: [evaluation],
      user,
      workspace,
    })

    mockExperiment = experiment

    mockJob = {
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        experimentId: mockExperiment.id,
        commitUuid: commit.uuid,
        prompt: 'Test prompt',
        parameters: { key: 'value' },
        datasetRowId,
      },
    } as Job<any>
  })

  it('should not update status if error is retryable', async () => {
    mocks.runDocumentAtCommitWithAutoToolResponses.mockRejectedValue(
      new ChainError({
        message: 'rate limited!',
        code: RunErrorCodes.RateLimit,
      }),
    )

    await expect(runDocumentForExperimentJob(mockJob)).rejects.toThrow('rate limited!')

    expect(mocks.updateExperimentStatus).not.toHaveBeenCalled()
  })

  // TODO: timeout's in CI
  it.skip('should not run the document if the experiment is finished', async () => {
    await completeExperiment(mockExperiment).then((r) => r.unwrap())

    await runDocumentForExperimentJob(mockJob)

    expect(mocks.runDocumentAtCommitWithAutoToolResponses).not.toHaveBeenCalled()
  })
})
