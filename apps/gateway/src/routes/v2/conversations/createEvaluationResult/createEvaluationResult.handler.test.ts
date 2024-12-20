import {
  DocumentLog,
  Evaluation,
  EvaluationMetadataType,
  EvaluationResultableType,
  ProviderLog,
  Providers,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import {
  createDocumentLog,
  createEvaluation,
  createLlmAsJudgeEvaluation,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import app from '$/routes/app'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findLastProviderLogFromDocumentLogUuid: vi.fn(),
  createEvaluationResult: vi.fn(),
  filterByDocumentUuid: vi.fn(),
}))

vi.mock('@latitude-data/core/data-access', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    // @ts-expect-error - Mock
    ...actual,
    findLastProviderLogFromDocumentLogUuid:
      mocks.findLastProviderLogFromDocumentLogUuid,
  }
})

vi.mock('@latitude-data/core/services/evaluationResults/create', () => ({
  createEvaluationResult: mocks.createEvaluationResult,
}))

vi.mock('@latitude-data/core/repositories', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    // @ts-expect-error - Mock
    ...actual,
    ConnectedEvaluationsRepository: vi.fn().mockImplementation(() => ({
      filterByDocumentUuid: mocks.filterByDocumentUuid,
    })),
  }
})

let workspace: Workspace
let user: User
let evaluation: Evaluation
let documentLog: DocumentLog
let providerLog: ProviderLog
let token: string
let headers: Record<string, string>
let route = () =>
  `/api/v2/conversations/${documentLog.uuid}/evaluations/${evaluation.uuid}/evaluation-results`

describe('POST /evaluation-results', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v2/conversations/uuid/evaluations/uuid/evaluation-results',
        {
          method: 'POST',
          body: JSON.stringify({
            result: true,
            reason: 'test reason',
          }),
        },
      )

      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer realm=""')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      const {
        workspace: wsp,
        user: us,
        commit,
        documents,
      } = await createProject({
        providers: [
          {
            name: 'openai',
            type: Providers.OpenAI,
          },
        ],
        documents: {
          foo: helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        },
      })
      const document = documents[0]!
      workspace = wsp
      user = us
      const apikey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      token = apikey?.token!

      evaluation = await createEvaluation({
        workspace,
        user,
        resultType: EvaluationResultableType.Boolean,
        resultConfiguration: {},
        metadataType: EvaluationMetadataType.Manual,
      })

      const {
        documentLog: dl,
        providerLogs: [pl],
      } = await createDocumentLog({
        commit,
        document,
      })
      documentLog = dl
      providerLog = pl!

      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }

      mocks.findLastProviderLogFromDocumentLogUuid.mockResolvedValue(
        providerLog,
      )
      mocks.createEvaluationResult.mockImplementation(async (args) =>
        Result.ok({
          ...args,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      )

      mocks.filterByDocumentUuid.mockResolvedValue(
        Result.ok([
          {
            evaluationId: evaluation.id,
          },
        ]),
      )
    })

    it('creates evaluation result successfully', async () => {
      const res = await app.request(route(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: true,
          reason: 'test reason',
        }),
      })

      expect(res.status).toBe(200)

      const body = await res.json()

      expect(body).toMatchObject({
        evaluation: expect.objectContaining({
          id: evaluation.id,
        }),
        documentLog: expect.objectContaining({
          uuid: documentLog.uuid,
        }),
        evaluatedProviderLog: expect.objectContaining({
          id: providerLog.id,
        }),
        result: {
          result: true,
          reason: 'test reason',
        },
      })
    })

    it('fails when result type does not match evaluation type', async () => {
      const res = await app.request(route(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: 'string instead of boolean',
          reason: 'test reason',
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body).toMatchObject({
        message: 'Result must be a boolean, got string',
      })
    })

    it('fails when provider log is not found', async () => {
      mocks.findLastProviderLogFromDocumentLogUuid.mockResolvedValue(null)

      const res = await app.request(route(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: true,
          reason: 'test reason',
        }),
      })

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body).toMatchObject({
        message: 'Could not find the log to evaluate',
      })
    })

    it('fails when evaluation type is not supported', async () => {
      const { user } = await createProject()
      evaluation = await createEvaluation({
        workspace,
        user,
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      })

      const res = await app.request(route(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: 'wat',
          reason: 'test reason',
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body).toMatchObject({
        message:
          'Evaluation type does not support evaluation results submitted via the HTTP API',
      })
    })

    describe('result type validation', () => {
      beforeEach(() => {
        evaluation = {
          ...evaluation,
          metadataType: EvaluationMetadataType.Manual,
        }
      })

      it('validates number type correctly', async () => {
        const { user } = await createProject()
        evaluation = await createLlmAsJudgeEvaluation({
          workspace,
          user,
          configuration: {
            type: EvaluationResultableType.Number,
            detail: {
              range: {
                from: 1,
                to: 10,
              },
            },
          },
        })

        const res = await app.request(route(), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            result: 'not a number',
            reason: 'test reason',
          }),
        })

        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body).toMatchObject({
          message: 'Result must be a number, got string',
        })
      })

      it('validates text type correctly', async () => {
        const { user } = await createProject()
        evaluation = await createLlmAsJudgeEvaluation({
          workspace,
          user,
          configuration: {
            type: EvaluationResultableType.Text,
          },
        })

        const res = await app.request(route(), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            result: true,
            reason: 'test reason',
          }),
        })

        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body).toMatchObject({
          message: 'Result must be a string, got boolean',
        })
      })
    })

    it('fails when evaluation is not connected to the document', async () => {
      // Mock that no evaluations are connected to this document
      mocks.filterByDocumentUuid.mockResolvedValue(Result.ok([]))

      const res = await app.request(route(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: true,
          reason: 'test reason',
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body).toMatchObject({
        message: 'The evaluation is not connected to this prompt',
      })
    })
  })
})
