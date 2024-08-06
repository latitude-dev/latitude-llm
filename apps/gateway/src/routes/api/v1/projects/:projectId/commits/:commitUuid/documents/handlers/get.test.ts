import {
  apiKeys,
  database,
  DocumentVersionsRepository,
  factories,
  mergeCommit,
} from '@latitude-data/core'
import app from '$/index'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('GET documents', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v1/projects/1/commits/asldkfjhsadl/documents/path/to/document',
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    it('succeeds', async () => {
      const { workspace, user, project } = await factories.createProject()
      const apikey = await database.query.apiKeys.findFirst({
        where: eq(apiKeys.workspaceId, workspace.id),
      })
      const path = 'path/to/document'
      const { commit } = await factories.createDraft({
        project,
        user,
      })
      const document = await factories.createDocumentVersion({ commit, path })

      await mergeCommit(commit).then((r) => r.unwrap())

      // TODO: We refetch the document because merging a commit actually replaces the
      // draft document with a new one. Review this behavior.
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documentVersion = await docsScope
        .getDocumentByPath({ commit, path })
        .then((r) => r.unwrap())

      const route = `/api/v1/projects/${project!.id}/commits/${commit!.uuid}/documents/${document.documentVersion.path}`
      const res = await app.request(route, {
        headers: {
          Authorization: `Bearer ${apikey!.token}`,
        },
      })

      expect(res.status).toBe(200)
      expect(await res.json().then((r) => r.id)).toEqual(documentVersion.id)
    })
  })
})
