import app from '$/routes/app'
import { NotFoundError } from '@latitude-data/constants/errors'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createDraft,
  createProject,
  createDocumentVersion,
} from '@latitude-data/core/factories'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('POST /projects/:projectId/versions/:versionUuid/publish', () => {
  describe('when unauthorized', () => {
    it('fails', async () => {
      const response = await app.request(
        '/api/v3/projects/1/versions/test-uuid/publish',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      )

      expect(response.status).toBe(401)
    })
  })

  describe('when authorized', () => {
    let headers: Record<string, string>
    let projectId: number
    let project: any
    let workspace: any
    let user: any

    beforeEach(async () => {
      vi.clearAllMocks()

      // Create a project and user for testing
      const result = await createProject()
      workspace = result.workspace
      project = result.project
      projectId = result.project.id
      user = result.user

      // Set up auth headers
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      headers = {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      }
    })

    it('succeeds when publishing a draft commit', async () => {
      // Create a draft commit with a document
      const { commit: draftCommit } = await createDraft({
        project,
        user,
      })

      // Add a document to the draft so it has changes
      await createDocumentVersion({
        workspace,
        user,
        commit: draftCommit,
        path: 'test-document',
        content: 'test content',
      })

      const response = await app.request(
        `/api/v3/projects/${projectId}/versions/${draftCommit.uuid}/publish`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      )

      expect(response.status).toBe(200)
      const publishedCommit = await response.json()

      expect(publishedCommit).toEqual(
        expect.objectContaining({
          id: draftCommit.id,
          uuid: draftCommit.uuid,
          projectId: projectId,
          mergedAt: expect.any(String),
          version: expect.any(Number),
        }),
      )
      expect(publishedCommit.mergedAt).toBeTruthy()
      expect(publishedCommit.version).toBeGreaterThan(0)
    })

    it('succeeds when publishing with optional title and description', async () => {
      // Create a draft commit with a document
      const { commit: draftCommit } = await createDraft({
        project,
        user,
      })

      // Add a document to the draft so it has changes
      await createDocumentVersion({
        workspace,
        user,
        commit: draftCommit,
        path: 'test-document',
        content: 'test content',
      })

      const newTitle = 'Updated Published Title'
      const newDescription = 'Published with description'

      const response = await app.request(
        `/api/v3/projects/${projectId}/versions/${draftCommit.uuid}/publish`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: newTitle,
            description: newDescription,
          }),
        },
      )

      expect(response.status).toBe(200)
      const publishedCommit = await response.json()

      expect(publishedCommit).toEqual(
        expect.objectContaining({
          id: draftCommit.id,
          uuid: draftCommit.uuid,
          projectId: projectId,
          mergedAt: expect.any(String),
          version: expect.any(Number),
        }),
      )
    })

    it('fails when version UUID is missing', async () => {
      const response = await app.request(
        `/api/v3/projects/${projectId}/versions//publish`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      )

      expect(response.status).toBe(404)
    })

    it('fails when project ID is invalid', async () => {
      // Create a draft commit
      const { commit: draftCommit } = await createDraft({
        project,
        user,
      })

      // Mock CommitsRepository.getCommitByUuid to throw for invalid project
      vi.spyOn(
        CommitsRepository.prototype,
        'getCommitByUuid',
        // @ts-expect-error: mocking
      ).mockImplementationOnce(() => {
        return Promise.resolve({
          unwrap: () => {
            throw new NotFoundError('Commit not found')
          },
        })
      })

      const response = await app.request(
        `/api/v3/projects/999999/versions/${draftCommit.uuid}/publish`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      )

      expect(response.status).toBe(404)
    })

    it('fails when version UUID does not exist', async () => {
      const response = await app.request(
        `/api/v3/projects/${projectId}/versions/00000000-0000-0000-0000-000000000000/publish`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      )

      expect(response.status).toBe(404)
    })

    it('fails when trying to publish an already merged commit', async () => {
      // Create a project with a merged commit
      const result = await createProject({
        documents: {
          test: 'test content',
        },
      })
      const mergedCommit = result.commit

      // Set up auth headers for the new workspace
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: result.workspace.id,
      }).then((r) => r.unwrap())

      const newHeaders = {
        Authorization: `Bearer ${apiKey.token}`,
        'Content-Type': 'application/json',
      }

      const response = await app.request(
        `/api/v3/projects/${result.project.id}/versions/${mergedCommit.uuid}/publish`,
        {
          method: 'POST',
          headers: newHeaders,
          body: JSON.stringify({}),
        },
      )

      expect(response.status).toBe(400)
      const error = await response.json()
      expect(error.message).toContain('Cannot modify a merged commit')
    })
  })
})
