import app from '$/routes/app'
import { Providers } from '@latitude-data/constants'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/queries/apiKeys/unsafelyGetFirstApiKeyByWorkspaceId'
import {
  createDraft,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('POST /documents', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v3/projects/1/versions/asldkfjhsadl/documents',
        {
          method: 'POST',
          body: JSON.stringify({
            path: 'path/to/document',
            prompt: 'Test prompt',
          }),
        },
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    it('creates a new document successfully', async () => {
      const { workspace, user, project, providers } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      const { commit: draft } = await createDraft({
        project,
        user,
      })

      const path = 'path/to/new/document'
      const promptContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Hello {{name}}',
        extraConfig: {
          parameters: {
            testParam: { type: 'string' },
          },
        },
      })

      const route = `/api/v3/projects/${project!.id}/versions/${draft!.uuid}/documents`
      const res = await app.request(route, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          prompt: promptContent,
        }),
      })

      expect(res.status).toBe(200)

      // Verify the response format
      const doc = await res.json()
      expect(doc).toEqual({
        versionUuid: draft.uuid,
        uuid: expect.any(String),
        path,
        content: promptContent,
        config: {
          model: 'test-model',
          provider: providers[0]!.name,
          parameters: {
            testParam: { type: 'string' },
          },
        },
        parameters: {
          name: { type: 'text' },
          testParam: { type: 'string' },
        },
        provider: providers[0]!.provider,
      })

      // Verify the document was actually created in the repository
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documentVersion = await docsScope
        .getDocumentByPath({ commit: draft, path })
        .then((r) => r.unwrap())

      expect(documentVersion.path).toBe(path)
      expect(documentVersion.content).toBe(promptContent)
    })

    it('fails with invalid parameters', async () => {
      const { workspace, user, project } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      const { commit: draft } = await createDraft({
        project,
        user,
      })

      const route = `/api/v3/projects/${project!.id}/versions/${draft!.uuid}/documents`
      const res = await app.request(route, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing required 'path' field
          prompt: 'Test prompt',
        }),
      })

      expect(res.status).toBe(400)
    })

    it('fails when trying to create a document on a published commit', async () => {
      const { workspace, project, providers, commit } = await createProject({
        providers: [
          {
            name: 'openai',
            type: Providers.OpenAI,
          },
        ],
        documents: {
          miau: helpers.createPrompt({ provider: 'openai' }),
        },
      })
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      })

      const path = 'path/to/document'
      const promptContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Test content',
      })

      const route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents`
      const res = await app.request(route, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          prompt: promptContent,
        }),
      })

      // Should fail because we can't modify a published commit
      expect(res.status).toBe(400)
      const errorResponse = await res.json()
      expect(errorResponse.message).toContain('Cannot modify a merged commit')
    })
  })
})
