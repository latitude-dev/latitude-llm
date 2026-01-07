import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Optimization } from '../../schema/models/types/Optimization'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { endOptimization } from './end'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('endOptimization', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: WorkspaceDto
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let user: User
  let optimization: Optimization

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      workspace: w,
      project: p,
      commit: c,
      documents,
      user: u,
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
    commit = c
    document = documents[0]!
    user = u

    optimization = await factories.createOptimization({
      baseline: { commit },
      document,
      project,
      workspace,
    })

    mocks = {
      publisher: vi.mocked(publisher.publishLater),
    }
  })

  it('fails when optimization is already finished', async () => {
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

    const finishedOptimization = await factories.createOptimization({
      baseline: { commit, experiment: baselineExperiment },
      document,
      project,
      workspace,
      trainset: await factories
        .createDataset({ workspace, author: user })
        .then((r) => r.dataset),
      testset: await factories
        .createDataset({ workspace, author: user })
        .then((r) => r.dataset),
      optimized: {
        commit: commit,
        prompt: 'optimized prompt',
        experiment: optimizedExperiment,
      },
    })

    await expect(
      endOptimization({
        optimization: finishedOptimization,
        workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Optimization already ended'),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('ends optimization successfully without error', async () => {
    const result = await endOptimization({
      optimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.finishedAt).not.toBeNull()
    expect(result.optimization.error).toBeNull()

    expect(mocks.publisher).toHaveBeenCalledTimes(1)
    expect(mocks.publisher).toHaveBeenCalledWith({
      type: 'optimizationEnded',
      data: {
        workspaceId: workspace.id,
        optimizationId: optimization.id,
      },
    })
  })

  it('ends optimization successfully with error message', async () => {
    const errorMessage = 'Something went wrong'

    const result = await endOptimization({
      error: errorMessage,
      optimization,
      workspace,
    }).then((r) => r.unwrap())

    expect(result.optimization.finishedAt).not.toBeNull()
    expect(result.optimization.error).toBe(errorMessage)

    expect(mocks.publisher).toHaveBeenCalledTimes(1)
    expect(mocks.publisher).toHaveBeenCalledWith({
      type: 'optimizationEnded',
      data: {
        workspaceId: workspace.id,
        optimizationId: optimization.id,
      },
    })
  })

  it('updates the optimization timestamps correctly', async () => {
    const beforeEnd = new Date()

    const result = await endOptimization({
      optimization,
      workspace,
    }).then((r) => r.unwrap())

    const afterEnd = new Date()

    expect(result.optimization.finishedAt).not.toBeNull()
    expect(result.optimization.finishedAt!.getTime()).toBeGreaterThanOrEqual(
      beforeEnd.getTime(),
    )
    expect(result.optimization.finishedAt!.getTime()).toBeLessThanOrEqual(
      afterEnd.getTime(),
    )
    expect(result.optimization.updatedAt.getTime()).toBeGreaterThanOrEqual(
      beforeEnd.getTime(),
    )
    expect(result.optimization.updatedAt.getTime()).toBeLessThanOrEqual(
      afterEnd.getTime(),
    )
  })
})
