import {
  EvaluationMetadataType,
  EvaluationResultableType,
  ProviderApiKey,
  Providers,
} from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ejectEvaluationAction } from './eject'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@latitude-data/core/repositories/evaluationsRepository')

describe('ejectEvaluationAction', () => {
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

      const [_, error] = await ejectEvaluationAction({
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
      evaluation = await factories.createEvaluation({
        workspace,
        user,
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
        metadata: {
          providerApiKeyId: provider.id,
          model: 'gpt-4o',
          objective: 'Test objective',
          additionalInstructions: 'Test additional instructions',
        },
        resultType: EvaluationResultableType.Boolean,
        resultConfiguration: {
          trueValueDescription: 'Test true value description',
          falseValueDescription: 'Test false value description',
        },
      })

      mocks.getSession.mockReturnValue({
        user: userData,
      })
    })

    it('successfully ejects an evaluation', async () => {
      // @ts-expect-error - Mocking the repository
      vi.mocked(EvaluationsRepository).mockImplementation(() => ({
        find: vi.fn().mockResolvedValue(Result.ok(evaluation)),
      }))

      const [data, error] = await ejectEvaluationAction({
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

      const [_, error] = await ejectEvaluationAction({
        id: 999,
      })

      expect(error).not.toBeNull()
      expect(error!.message).toEqual('Evaluation not found')
    })
  })
})
