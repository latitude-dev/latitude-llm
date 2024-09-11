import {
  DocumentVersion,
  Project,
  ProviderApiKey,
  Providers,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { connectEvaluationsAction } from './connect'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('connectEvaluationsAction', () => {
  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const [_, error] = await connectEvaluationsAction({
        projectId: 1,
        documentUuid: 'fake-document-uuid',
        templateIds: [1],
        evaluationUuids: ['fake-evaluation-uuid'],
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    let workspace: Workspace,
      user: User,
      document: DocumentVersion,
      provider: ProviderApiKey,
      project: Project

    beforeEach(async () => {
      const setup = await factories.createProject({
        documents: { 'test-doc': 'Test content' },
      })
      workspace = setup.workspace
      user = setup.user
      document = setup.documents[0]!
      project = setup.project

      provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'Test Provider',
        user,
      })

      mocks.getSession.mockReturnValue({
        user,
        workspace: { id: workspace.id, name: workspace.name },
      })
    })

    it('connects evaluations and templates to a document', async () => {
      const evaluation = await factories.createLlmAsJudgeEvaluation({
        workspace,
        name: 'Test Evaluation',
        prompt: factories.helpers.createPrompt({ provider }),
      })

      const template = await factories.createEvaluationTemplate({
        name: 'Test Template',
        description: 'Test description',
        prompt: 'Test prompt',
      })

      const [result, error] = await connectEvaluationsAction({
        projectId: project.id,
        documentUuid: document.documentUuid,
        templateIds: [template.id],
        evaluationUuids: [evaluation.uuid],
      })

      expect(error).toBeNull()
      expect(result).toHaveLength(2)
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            documentUuid: document.documentUuid,
            evaluationId: evaluation.id,
          }),
          expect.objectContaining({
            documentUuid: document.documentUuid,
            evaluationId: expect.any(Number),
          }),
        ]),
      )
    })

    it('returns an empty array when no evaluations or templates are provided', async () => {
      const [result, error] = await connectEvaluationsAction({
        projectId: project.id,
        documentUuid: document.documentUuid,
        templateIds: [],
        evaluationUuids: [],
      })

      expect(error).toBeNull()
      expect(result).toHaveLength(0)
    })

    it('fails when the document does not exist', async () => {
      const [_, error] = await connectEvaluationsAction({
        projectId: project.id,
        documentUuid: 'non-existent-uuid',
        templateIds: [],
        evaluationUuids: [],
      })

      expect(error!.name).toEqual('NotFoundError')
    })
  })
})
