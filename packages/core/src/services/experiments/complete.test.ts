import { Providers } from '@latitude-data/constants'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { experiments } from '../../schema/models/experiments'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import * as endValidateModule from '../optimizations/validate/end'
import { completeExperiment } from './complete'

describe('completeExperiment', () => {
  let commit: Commit
  let document: DocumentVersion
  let project: Project
  let user: User
  let workspace: Workspace
  let endValidateOptimizationMock: MockInstance

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      documents: d,
      commit: c,
      project: p,
      user: u,
      workspace: w,
    } = await factories.createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        doc: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    document = d[0]!
    commit = c
    project = p
    user = u
    workspace = w

    endValidateOptimizationMock = vi
      .spyOn(endValidateModule, 'endValidateOptimization')
      .mockImplementation(async ({ optimization }) => {
        return Result.ok({ optimization })
      })
  })

  it('successfully completes an experiment', async () => {
    const { experiment } = await factories.createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })

    const result = await completeExperiment({ experiment })

    expect(result.ok).toBe(true)
    expect(result.value?.finishedAt).toBeInstanceOf(Date)

    const updatedExperiment = await database
      .select()
      .from(experiments)
      .where(eq(experiments.id, experiment.id))
      .limit(1)

    expect(updatedExperiment[0]?.finishedAt).toBeInstanceOf(Date)
  })

  it('does not call endValidateOptimization when experiment is not part of optimization', async () => {
    const { experiment } = await factories.createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })

    await completeExperiment({ experiment })

    expect(endValidateOptimizationMock).not.toHaveBeenCalled()
  })

  it('does not call endValidateOptimization when cancelled is true', async () => {
    const { experiment: baselineExperiment } = await factories.createExperiment(
      {
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      },
    )

    const { experiment: optimizedExperiment } =
      await factories.createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

    const { dataset: trainset } = await factories.createDataset({
      workspace,
      author: user,
    })

    const { dataset: testset } = await factories.createDataset({
      workspace,
      author: user,
    })

    await factories.createOptimization({
      baseline: {
        commit,
        experiment: baselineExperiment,
      },
      optimized: {
        commit,
        prompt: 'optimized prompt',
        experiment: optimizedExperiment,
      },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    await completeExperiment({
      experiment: { ...optimizedExperiment, finishedAt: new Date() },
    })

    await completeExperiment({
      experiment: baselineExperiment,
      cancelled: true,
    })

    expect(endValidateOptimizationMock).not.toHaveBeenCalled()
  })

  it('does not call endValidateOptimization when other experiment is not finished', async () => {
    const { experiment: baselineExperiment } = await factories.createExperiment(
      {
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      },
    )

    const { experiment: optimizedExperiment } =
      await factories.createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

    const { dataset: trainset } = await factories.createDataset({
      workspace,
      author: user,
    })

    const { dataset: testset } = await factories.createDataset({
      workspace,
      author: user,
    })

    await factories.createOptimization({
      baseline: {
        commit,
        experiment: baselineExperiment,
      },
      optimized: {
        commit,
        prompt: 'optimized prompt',
        experiment: optimizedExperiment,
      },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    await completeExperiment({ experiment: baselineExperiment })

    expect(endValidateOptimizationMock).not.toHaveBeenCalled()
  })

  it('calls endValidateOptimization when both experiments are finished (completing baseline last)', async () => {
    const { experiment: baselineExperiment } = await factories.createExperiment(
      {
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      },
    )

    const { experiment: optimizedExperiment } =
      await factories.createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

    const { dataset: trainset } = await factories.createDataset({
      workspace,
      author: user,
    })

    const { dataset: testset } = await factories.createDataset({
      workspace,
      author: user,
    })

    await factories.createOptimization({
      baseline: {
        commit,
        experiment: baselineExperiment,
      },
      optimized: {
        commit,
        prompt: 'optimized prompt',
        experiment: optimizedExperiment,
      },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    await completeExperiment({ experiment: optimizedExperiment })

    expect(endValidateOptimizationMock).not.toHaveBeenCalled()

    await completeExperiment({ experiment: baselineExperiment })

    expect(endValidateOptimizationMock).toHaveBeenCalledTimes(1)
    expect(endValidateOptimizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        optimization: expect.objectContaining({
          baselineExperimentId: baselineExperiment.id,
          optimizedExperimentId: optimizedExperiment.id,
        }),
        workspace: expect.objectContaining({ id: workspace.id }),
      }),
    )
  })

  it('calls endValidateOptimization when both experiments are finished (completing optimized last)', async () => {
    const { experiment: baselineExperiment } = await factories.createExperiment(
      {
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      },
    )

    const { experiment: optimizedExperiment } =
      await factories.createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

    const { dataset: trainset } = await factories.createDataset({
      workspace,
      author: user,
    })

    const { dataset: testset } = await factories.createDataset({
      workspace,
      author: user,
    })

    await factories.createOptimization({
      baseline: {
        commit,
        experiment: baselineExperiment,
      },
      optimized: {
        commit,
        prompt: 'optimized prompt',
        experiment: optimizedExperiment,
      },
      document,
      project,
      workspace,
      trainset,
      testset,
    })

    await completeExperiment({ experiment: baselineExperiment })

    expect(endValidateOptimizationMock).not.toHaveBeenCalled()

    await completeExperiment({ experiment: optimizedExperiment })

    expect(endValidateOptimizationMock).toHaveBeenCalledTimes(1)
    expect(endValidateOptimizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        optimization: expect.objectContaining({
          baselineExperimentId: baselineExperiment.id,
          optimizedExperimentId: optimizedExperiment.id,
        }),
        workspace: expect.objectContaining({ id: workspace.id }),
      }),
    )
  })
})
