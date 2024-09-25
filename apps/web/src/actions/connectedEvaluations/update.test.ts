import { Providers } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateConnectedEvaluationAction } from './update'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('updateConnectedEvaluationAction', () => {
  let workspace: any
  let project: any
  let user: any
  let connectedEvaluation: any

  beforeEach(async () => {
    const prompt = factories.helpers.createPrompt({
      provider: 'Latitude',
      model: 'gpt-4o',
    })
    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
      name: 'Default Project',
      documents: {
        foo: {
          content: prompt,
        },
      },
    })
    workspace = setup.workspace
    project = setup.project
    user = setup.user

    // Create a connected evaluation using a factory
    const evaluation = await factories.createLlmAsJudgeEvaluation({ workspace })
    const { commit } = await factories.createDraft({ project, user })
    const { documentLog } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit,
    })

    connectedEvaluation = await factories.createConnectedEvaluation({
      workspace,
      evaluationUuid: evaluation.uuid,
      documentUuid: documentLog.documentUuid,
    })
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockReturnValue(null)

      const [_, error] = await updateConnectedEvaluationAction({
        id: connectedEvaluation.id,
        data: { live: true },
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

    it('successfully updates a connected evaluation', async () => {
      const [data, error] = await updateConnectedEvaluationAction({
        id: connectedEvaluation.id,
        data: { live: true },
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.id).toEqual(connectedEvaluation.id)
      expect(data!.live).toEqual(true)
    })

    it('returns an error when the connected evaluation is not found', async () => {
      const [_, error] = await updateConnectedEvaluationAction({
        id: 9999, // Non-existent ID
        data: { live: true },
      })

      expect(error).toBeDefined()
      expect(error!.name).toEqual('NotFoundError')
    })

    it('does not update fields that are not provided', async () => {
      const [data, _] = await updateConnectedEvaluationAction({
        id: connectedEvaluation.id,
        data: { live: connectedEvaluation.live }, // Provide the required 'live' field
      })

      expect(data).toBeDefined()
      expect(data!.id).toEqual(connectedEvaluation.id)
      expect(data!.live).toEqual(connectedEvaluation.live) // Should remain unchanged
    })

    it('handles invalid input data', async () => {
      const [_, error] = await updateConnectedEvaluationAction({
        id: connectedEvaluation.id,
        // @ts-expect-error - Testing invalid input
        data: { live: 'not a boolean' },
      })

      expect(error).toBeDefined()
      expect(error!.name).toEqual('ZodError')
    })
  })
})
