import app from '$/routes/app'
import { Providers } from '@latitude-data/constants'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
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

describe('POST /documents/create-or-update', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v3/projects/1/versions/asldkfjhsadl/documents/create-or-update',
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
    it('creates a new document when it does not exist', async () => {
      const { workspace, user, project, providers } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      const { commit: draft } = await createDraft({
        project,
        user,
      })

      const path = 'path/to/new/document'
      const promptContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Hello {{name}}',
      })

      const route = `/api/v3/projects/${project!.id}/versions/${draft!.uuid}/documents/create-or-update`
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

      const doc = await res.json()
      expect(doc.path).toBe(path)
      expect(doc.content).toBe(promptContent)

      // Verify the document was created
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documentVersion = await docsScope
        .getDocumentByPath({ commit: draft, path })
        .then((r) => r.unwrap())

      expect(documentVersion.path).toBe(path)
      expect(documentVersion.content).toBe(promptContent)
    })

    it('updates an existing document', async () => {
      const { workspace, user, project, providers } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      const { commit: draft } = await createDraft({
        project,
        user,
      })

      const path = 'path/to/document'
      const initialContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Initial content',
      })

      const docsScope = new DocumentVersionsRepository(workspace.id)

      // Create initial document
      const route = `/api/v3/projects/${project!.id}/versions/${draft!.uuid}/documents/create-or-update`
      await app.request(route, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          prompt: initialContent,
        }),
      })

      // Update the document
      const updatedContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Updated content',
      })

      const updateRes = await app.request(route, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          prompt: updatedContent,
        }),
      })

      expect(updateRes.status).toBe(200)

      const doc = await updateRes.json()
      expect(doc.path).toBe(path)
      expect(doc.content).toBe(updatedContent)

      // Verify the document was updated
      const documentVersion = await docsScope
        .getDocumentByPath({ commit: draft, path })
        .then((r) => r.unwrap())

      expect(documentVersion.content).toBe(updatedContent)
    })

    it('fails when trying to modify a live commit without force', async () => {
      const { workspace, project, providers, commit } = await createProject({
        providers: [
          {
            name: 'openai',
            type: Providers.OpenAI,
          },
        ],
        documents: {
          existing: helpers.createPrompt({ provider: 'openai' }),
        },
      })
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      const path = 'path/to/document'
      const promptContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Test content',
      })

      const route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/create-or-update`
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

      expect(res.status).toBe(400)
      const errorResponse = await res.json()
      expect(errorResponse.message).toContain('Cannot modify a merged commit')
      expect(errorResponse.message).toContain('force=true')
    })

    it('allows modifying a live commit with force=true', async () => {
      const { workspace, project, providers, commit } = await createProject({
        providers: [
          {
            name: 'openai',
            type: Providers.OpenAI,
          },
        ],
        documents: {
          existing: helpers.createPrompt({ provider: 'openai' }),
        },
      })
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      const path = 'new/document'
      const promptContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Force created content',
      })

      const route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/create-or-update`
      const res = await app.request(route, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          prompt: promptContent,
          force: true,
        }),
      })

      expect(res.status).toBe(200)

      const doc = await res.json()
      expect(doc.path).toBe(path)
      expect(doc.content).toBe(promptContent)

      // Verify the document was created in the live commit
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documentVersion = await docsScope
        .getDocumentByPath({ commit, path })
        .then((r) => r.unwrap())

      expect(documentVersion.path).toBe(path)
      expect(documentVersion.content).toBe(promptContent)
    })

    it('allows updating existing document in live commit with force=true', async () => {
      const { workspace, project, providers, commit } = await createProject({
        providers: [
          {
            name: 'openai',
            type: Providers.OpenAI,
          },
        ],
        documents: {
          existing: helpers.createPrompt({
            provider: 'openai',
            content: 'Original content',
          }),
        },
      })
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      const path = 'existing'
      const updatedContent = helpers.createPrompt({
        provider: providers[0]!.name,
        model: 'test-model',
        content: 'Force updated content',
      })

      const route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/create-or-update`
      const res = await app.request(route, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          prompt: updatedContent,
          force: true,
        }),
      })

      expect(res.status).toBe(200)

      const doc = await res.json()
      expect(doc.path).toBe(path)
      expect(doc.content).toBe(updatedContent)

      // Verify the document was updated
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documentVersion = await docsScope
        .getDocumentByPath({ commit, path })
        .then((r) => r.unwrap())

      expect(documentVersion.content).toBe(updatedContent)
    })

    it('fails with invalid parameters', async () => {
      const { workspace, user, project } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      const { commit: draft } = await createDraft({
        project,
        user,
      })

      const route = `/api/v3/projects/${project!.id}/versions/${draft!.uuid}/documents/create-or-update`
      const res = await app.request(route, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing required 'path' and 'prompt' fields
          force: true,
        }),
      })

      expect(res.status).toBe(400)
    })
  })
})
