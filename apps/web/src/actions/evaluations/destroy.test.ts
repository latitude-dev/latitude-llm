import { Providers } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { destroyEvaluation } from '@latitude-data/core/services/evaluations/destroy'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { destroyEvaluationAction } from './destroy'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@latitude-data/core/repositories')
vi.mock('@latitude-data/core/services/evaluations/destroy')

describe('destroyEvaluationAction', () => {
  describe('unauthorized', () => {
    let evaluationId: number

    beforeEach(async () => {
      const { workspace, userData } = await factories.createWorkspace()
      const provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'Test Provider',
        user: userData,
      })
      const evaluation = await factories.createLlmAsJudgeEvaluation({
        workspace,
        prompt: factories.helpers.createPrompt({ provider }),
      })
      evaluationId = evaluation.id
    })

    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockReturnValue(null)

      const [_, error] = await destroyEvaluationAction({
        id: evaluationId,
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    let evaluation: any
    let user: any
    let workspace: any

    beforeEach(async () => {
      const { workspace: createdWorkspace, userData } =
        await factories.createWorkspace()
      workspace = createdWorkspace
      user = userData
      const provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'Test Provider',
        user,
      })
      evaluation = await factories.createLlmAsJudgeEvaluation({
        workspace,
        prompt: factories.helpers.createPrompt({ provider }),
      })

      mocks.getSession.mockReturnValue({
        user: userData,
      })
    })

    it('successfully destroys an evaluation', async () => {
      // @ts-expect-error - Mocking the repository
      vi.mocked(EvaluationsRepository).mockImplementation(() => ({
        find: vi.fn().mockResolvedValue(Result.ok(evaluation)),
      }))
      // @ts-expect-error - Mocking the repository
      vi.mocked(destroyEvaluation).mockResolvedValue(Result.ok(true))

      const [data, error] = await destroyEvaluationAction({
        id: evaluation.id,
      })

      expect(error).toBeNull()
      expect(data).toBe(true)
      expect(EvaluationsRepository).toHaveBeenCalledWith(workspace.id)
      expect(destroyEvaluation).toHaveBeenCalledWith({ evaluation })
    })

    it('throws an error if evaluation is not found', async () => {
      // @ts-expect-error - Mocking the repository
      vi.mocked(EvaluationsRepository).mockImplementation(() => ({
        find: vi
          .fn()
          .mockResolvedValue(Result.error(new Error('Evaluation not found'))),
      }))

      const [_, error] = await destroyEvaluationAction({
        id: 999,
      })

      expect(error).not.toBeNull()
      expect(error!.message).toEqual('Evaluation not found')
    })

    it('throws an error if destroyEvaluation fails', async () => {
      // @ts-expect-error - Mocking the repository
      vi.mocked(EvaluationsRepository).mockImplementation(() => ({
        find: vi.fn().mockResolvedValue(Result.ok(evaluation)),
      }))
      vi.mocked(destroyEvaluation).mockResolvedValue(
        Result.error(new Error('Failed to destroy evaluation')),
      )

      const [_, error] = await destroyEvaluationAction({ id: evaluation.id })

      expect(error).not.toBeNull()
      expect(error!.message).toEqual('Failed to destroy evaluation')
    })
  })
})
