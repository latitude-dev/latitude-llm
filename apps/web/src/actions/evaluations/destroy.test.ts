import { ProviderApiKey, Providers } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
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

vi.mock('@latitude-data/core/repositories/evaluationsRepository')

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
        user: userData,
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
    let provider: ProviderApiKey

    beforeEach(async () => {
      const { workspace: createdWorkspace, userData } =
        await factories.createWorkspace()

      workspace = createdWorkspace
      user = userData
      provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'Test Provider',
        user,
      })
      evaluation = await factories.createLlmAsJudgeEvaluation({
        workspace,
        user,
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

      const [data, error] = await destroyEvaluationAction({
        id: evaluation.id,
      })

      expect(error).toBeNull()
      expect(data).toEqual(expect.objectContaining({ id: evaluation.id }))
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

    it('works even when trying to delete an evaluation connected to a document', async () => {
      const { documents } = await factories.createProject({
        workspace,
        documents: {
          foo: factories.helpers.createPrompt({ provider }),
        },
      })

      // @ts-expect-error - mock implementation
      vi.mocked(EvaluationsRepository).mockImplementation(() => ({
        find: vi.fn().mockResolvedValue(Result.ok(evaluation)),
        filterByUuids: vi.fn().mockResolvedValue(Result.ok([evaluation])),
      }))

      const document = documents[0]!
      await factories.createConnectedEvaluation({
        user,
        workspace,
        evaluationUuid: evaluation.uuid,
        documentUuid: document.documentUuid,
      })

      const [data, error] = await destroyEvaluationAction({ id: evaluation.id })

      expect(error).toBeNull()
      expect(data?.id).toEqual(evaluation.id)
    })
  })
})
