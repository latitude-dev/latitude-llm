import { Providers } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEvaluationResultAction } from './update'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('updateEvaluationResultAction', () => {
  let workspace: any
  let user: any
  let evaluationResult: any
  let document: any
  let commit: any

  beforeEach(async () => {
    const setup = await factories.createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        foo: factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    workspace = setup.workspace
    user = setup.user
    document = setup.documents[0]!
    commit = setup.commit

    const evaluation = await factories.createLlmAsJudgeEvaluation({
      workspace,
      user,
    })

    const { documentLog, providerLogs } = await factories.createDocumentLog({
      document,
      commit,
    })

    const { evaluationResult: evr } = await factories.createEvaluationResult({
      documentLog,
      evaluatedProviderLog: providerLogs[0]!,
      evaluation,
    })

    evaluationResult = evr
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockReturnValue(null)

      const [_, error] = await updateEvaluationResultAction({
        id: evaluationResult.id,
        value: true,
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    beforeEach(() => {
      mocks.getSession.mockReturnValue({
        user,
        workspace: { id: workspace.id, name: workspace.name },
      })
    })

    it('successfully updates an evaluation result', async () => {
      const [data, error] = await updateEvaluationResultAction({
        id: evaluationResult.id,
        value: 'miau',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.result).toEqual('miau')
      expect(data!.id).toEqual(evaluationResult.id)
    })

    it('updates the reason when provided', async () => {
      const [data, error] = await updateEvaluationResultAction({
        id: evaluationResult.id,
        value: 'miau',
        reason: 'because',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.result).toEqual('miau')
      expect(data!.reason).toEqual('because')
    })

    it('returns error when evaluation result is not found', async () => {
      const [_, error] = await updateEvaluationResultAction({
        id: 99999,
        value: true,
      })

      expect(error).toBeDefined()
      expect(error!.name).toEqual('NotFoundError')
    })
  })
})
