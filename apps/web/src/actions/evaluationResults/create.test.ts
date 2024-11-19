import {
  EvaluationResultableType,
  Providers,
} from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEvaluationResultAction } from './create'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('createEvaluationResultAction', () => {
  let workspace: any
  let user: any
  let evaluation: any
  let documentLog: any
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
          model: 'gpt-4o',
        }),
      },
    })
    workspace = setup.workspace
    user = setup.user
    document = setup.documents[0]!
    commit = setup.commit

    evaluation = await factories.createLlmAsJudgeEvaluation({
      workspace,
      user,
    })

    const { documentLog: dl } = await factories.createDocumentLog({
      document,
      commit: setup.commit,
    })
    documentLog = dl
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockReturnValue(null)

      const [_, error] = await createEvaluationResultAction({
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        type: EvaluationResultableType.Boolean,
        value: true,
        reason: 'Test reason',
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

    it('successfully creates an evaluation result', async () => {
      const [data, error] = await createEvaluationResultAction({
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        type: EvaluationResultableType.Boolean,
        value: true,
        reason: 'Test reason',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.result).toEqual(true)
      expect(data!.evaluationId).toEqual(evaluation.id)
      expect(data!.documentLogId).toEqual(documentLog.id)
      expect(data!.uuid).toBeDefined()
    })

    it('returns error when no provider log is found', async () => {
      const { documentLog: logWithoutProvider } =
        await factories.createDocumentLog({
          document,
          commit,
          skipProviderLogs: true,
        })

      const [_, error] = await createEvaluationResultAction({
        evaluationId: evaluation.id,
        documentLogId: logWithoutProvider.id,
        type: EvaluationResultableType.Boolean,
        value: true,
        reason: 'Test reason',
      })

      expect(error).toBeDefined()
      expect(error!.name).toEqual('NotFoundError')
      expect(error!.message).toContain('No evaluated provider log found')
    })

    it('accepts string values for results', async () => {
      const [data, error] = await createEvaluationResultAction({
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        type: EvaluationResultableType.Text,
        value: 'test result',
        reason: 'Test reason',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.result).toEqual('test result')
    })

    it('accepts numeric values for results', async () => {
      const [data, error] = await createEvaluationResultAction({
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        type: EvaluationResultableType.Number,
        value: 42,
        reason: 'Test reason',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.result).toEqual(42)
    })
  })
})
