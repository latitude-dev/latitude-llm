import app from '$/routes/app'
import { Providers } from '@latitude-data/constants'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('DELETE /documents/:documentPath', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v3/projects/1/versions/asldkfjhsadl/documents/path/to/document',
        { method: 'DELETE' },
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    it('deletes a document from a draft commit', async () => {
      const { workspace, user, project, providers } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      const { commit: draft } = await createDraft({
        project,
        user,
      })

      const path = 'path/to/document'
      const promptContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Hello world',
      })

      await createDocumentVersion({
        workspace,
        user,
        commit: draft,
        path,
        content: promptContent,
      })

      const route = `/api/v3/projects/${project!.id}/versions/${draft!.uuid}/documents/${path}`
      const res = await app.request(route, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      })

      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.documentUuid).toBeDefined()
      expect(body.path).toBe(path)

      const docsScope = new DocumentVersionsRepository(workspace.id)
      const docResult = await docsScope.getDocumentByPath({
        commit: draft,
        path,
      })
      expect(docResult.error).toBeDefined()
    })

    it('returns 404 when document does not exist', async () => {
      const { workspace, user, project } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      const { commit: draft } = await createDraft({
        project,
        user,
      })

      const route = `/api/v3/projects/${project!.id}/versions/${draft!.uuid}/documents/nonexistent/path`
      const res = await app.request(route, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      })

      expect(res.status).toBe(404)
    })

    it('fails when trying to delete a document on a merged commit', async () => {
      const { workspace, project, commit } = await createProject({
        providers: [
          {
            name: 'openai',
            type: Providers.OpenAI,
          },
        ],
        documents: {
          doc: helpers.createPrompt({ provider: 'openai' }),
        },
      })
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      const route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/doc`
      const res = await app.request(route, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      })

      expect(res.status).toBe(400)
    })
  })
})
