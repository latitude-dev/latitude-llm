import app from '$/index'
import { database } from '$core/client'
import { DocumentVersionsRepository } from '$core/repositories'
import { apiKeys, projects } from '$core/schema'
import { mergeCommit } from '$core/services'
import { createDraft } from '$core/tests/factories/commits'
import { createDocumentVersion } from '$core/tests/factories/documents'
import { createWorkspace } from '$core/tests/factories/workspaces'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

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
      const session = await createWorkspace()
      const project = await database.query.projects.findFirst({
        where: eq(projects.workspaceId, session.workspace.id),
      })
      const apikey = await database.query.apiKeys.findFirst({
        where: eq(apiKeys.workspaceId, session.workspace.id),
      })
      const path = '/path/to/document'
      const { commit } = await createDraft({ project })
      const document = await createDocumentVersion({ commit: commit!, path })

      await mergeCommit(commit).then((r) => r.unwrap())

      // TODO: We refetch the document because merging a commit actually replaces the
      // draft document with a new one. Review this behavior.
      const docsScope = new DocumentVersionsRepository(session.workspace.id)
      const documentVersion = await docsScope
        .getDocumentByPath({ commit, path })
        .then((r) => r.unwrap())

      const route = `/api/v1/projects/${project!.id}/commits/${commit!.uuid}/documents/${document.documentVersion.path.slice(1)}`
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
