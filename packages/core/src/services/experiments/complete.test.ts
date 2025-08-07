import { describe, it, expect, vi, beforeEach } from 'vitest'
import { completeExperiment } from './complete'
import { database } from '../../client'
import { experiments } from '../../schema'
import { WebsocketClient } from '../../websockets/workers'
import { ProgressTracker } from '../../jobs/utils/progressTracker'
import { eq } from 'drizzle-orm'
import { createExperiment, createProject, helpers } from '../../tests/factories'
import { Providers } from '@latitude-data/constants'
import type { Commit, Workspace, User, DocumentVersion } from '../../browser'

// Mock external dependencies
vi.mock('../../websockets/workers')
vi.mock('../../jobs/utils/progressTracker')

describe('completeExperiment', () => {
  let commit: Commit
  let document: DocumentVersion
  let user: User
  let workspace: Workspace

  const mockProgressTracker = {
    getProgress: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(ProgressTracker).mockImplementation(() => mockProgressTracker as any)
    const {
      documents: d,
      commit: c,
      user: u,
      workspace: w,
    } = await createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        doc: helpers.createPrompt({ provider: 'openai', model: 'gpt-4o' }),
      },
    })

    document = d[0]!
    commit = c
    user = u
    workspace = w
  })

  it('successfully completes an experiment', async () => {
    const { experiment } = await createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })
    const mockProgress = {
      completed: 10,
      failed: 2,
      errors: 1,
      totalScore: 85.5,
    }
    mockProgressTracker.getProgress.mockResolvedValue(mockProgress)

    const result = await completeExperiment(experiment)

    expect(result.ok).toBe(true)
    expect(result.value?.finishedAt).toBeInstanceOf(Date)

    // Verify the experiment was updated in the database
    const updatedExperiment = await database
      .select()
      .from(experiments)
      .where(eq(experiments.id, experiment.id))
      .limit(1)

    expect(updatedExperiment[0]?.finishedAt).toBeInstanceOf(Date)
  })

  it('emits websocket event with experiment status', async () => {
    const { experiment } = await createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })
    const mockProgress = {
      completed: 15,
      failed: 3,
      errors: 2,
      totalScore: 78.2,
    }
    mockProgressTracker.getProgress.mockResolvedValue(mockProgress)

    await completeExperiment(experiment)

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith('experimentStatus', {
      workspaceId: experiment.workspaceId,
      data: {
        experiment: {
          ...experiment,
          results: {
            passed: mockProgress.completed,
            failed: mockProgress.failed,
            errors: mockProgress.errors,
            totalScore: mockProgress.totalScore,
          },
        },
      },
    })
  })

  it('creates progress tracker with experiment uuid', async () => {
    const { experiment } = await createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })
    mockProgressTracker.getProgress.mockResolvedValue({
      completed: 0,
      failed: 0,
      errors: 0,
      totalScore: 0,
    })

    await completeExperiment(experiment)

    expect(ProgressTracker).toHaveBeenCalledWith(experiment.uuid)
    expect(mockProgressTracker.getProgress).toHaveBeenCalled()
  })
})
