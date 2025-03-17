import {
  ApiKey,
  DocumentLog,
  Providers,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access'
import {
  createConnectedEvaluation,
  createDocumentLog,
  createLlmAsJudgeEvaluation,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import app from '$/routes/app'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  evaluateDocumentLog: vi.fn(),
  queues: {
    defaultQueue: {
      jobs: {
        enqueueRunEvaluationJob: vi.fn(),
      },
    },
  },
}))

vi.mock('@latitude-data/core/services/documentLogs/evaluate', () => ({
  evaluateDocumentLog: mocks.evaluateDocumentLog,
}))

vi.mock('$/jobs', () => ({
  queues: mocks.queues,
}))

let route: string
let body: string
let token: string
let headers: Record<string, string>
let workspace: Workspace
let apiKey: ApiKey
let documentLog: DocumentLog
let user: User

describe('POST /evaluate', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v2/conversations/fake-document-log-uuid/evaluate',
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.evaluateDocumentLog.mockClear()
      mocks.queues.defaultQueue.jobs.enqueueRunEvaluationJob.mockClear()

      const {
        workspace: wsp,
        user: u,
        commit,
        documents,
      } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
        documents: {
          foo: helpers.createPrompt({
            provider: 'Latitude',
            model: 'gpt-4o',
          }),
        },
      })
      user = u
      const document = documents[0]!
      workspace = wsp
      const { documentLog: dl } = await createDocumentLog({
        document,
        commit,
      })
      documentLog = dl
      const key = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      apiKey = key!
      token = apiKey.token

      route = `/api/v2/conversations/${documentLog.uuid}/evaluate`
      body = JSON.stringify({})
      headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    })

    it('evaluates all evaluations when no evaluationUuids provided', async () => {
      const evaluation = await createLlmAsJudgeEvaluation({
        workspace,
        user,
      })

      await createConnectedEvaluation({
        workspace,
        user,
        documentUuid: documentLog.documentUuid,
        evaluationUuid: evaluation.uuid,
      })
      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        evaluations: [evaluation.uuid],
      })
      expect(mocks.evaluateDocumentLog).toHaveBeenCalledWith(
        documentLog,
        workspace,
        { evaluations: [expect.objectContaining({ id: evaluation.id })] },
      )
    })

    it('evaluates only specified evaluations when evaluationUuids provided', async () => {
      const evaluation = await createLlmAsJudgeEvaluation({
        workspace,
        user,
      })

      await createConnectedEvaluation({
        workspace,
        user,
        documentUuid: documentLog.documentUuid,
        evaluationUuid: evaluation.uuid,
      })
      const res = await app.request(route, {
        method: 'POST',
        body: JSON.stringify({ evaluationUuids: [evaluation.uuid] }),
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        evaluations: [evaluation.uuid],
      })
      expect(mocks.evaluateDocumentLog).toHaveBeenCalledWith(
        expect.any(Object), // documentLog
        workspace,
        {
          evaluations: expect.arrayContaining([
            expect.objectContaining({ uuid: evaluation.uuid }),
          ]),
        },
      )
    })

    it('handles case when no evaluations exist', async () => {
      mocks.evaluateDocumentLog.mockImplementationOnce(() => {
        return Result.ok({ evaluations: [] })
      })

      const res = await app.request(route, {
        method: 'POST',
        body,
        headers,
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        evaluations: [],
      })
      expect(mocks.evaluateDocumentLog).toHaveBeenCalledWith(
        expect.any(Object),
        workspace,
        { evaluations: [] },
      )
    })

    it('handles invalid conversation uuid', async () => {
      const res = await app.request(
        '/api/v2/conversations/invalid-uuid/evaluate',
        {
          method: 'POST',
          body,
          headers,
        },
      )

      expect(res.status).toBe(404)
    })
  })
})
