import app from '$/routes/app'
import { unsafelyGetFirstApiKeyByWorkspaceId } from '@latitude-data/core/data-access/apiKeys'
import {
  createDocumentVersion,
  createDraft,
  createProject,
  helpers,
} from '@latitude-data/core/factories'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { mergeCommit } from '@latitude-data/core/services/commits/merge'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('GET documents', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v3/projects/1/versions/asldkfjhsadl/documents/path/to/document',
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    it('succeeds', async () => {
      const { workspace, user, project, providers } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      const path = 'path/to/document'
      const { commit: draft } = await createDraft({
        project,
        user,
      })
      const document = await createDocumentVersion({
        workspace,
        user,
        commit: draft,
        path,
        content: helpers.createPrompt({
          provider: providers[0]!,
          model: 'foo',
          content: 'Hello {{name}}',
          extraConfig: {
            parameters: {
              // @ts-expect-error - testing purposes
              myFile: { type: 'file' },
            },
          },
        }),
      })

      const commit = await mergeCommit(draft).then((r) => r.unwrap())

      // TODO: We refetch the document because merging a commit actually replaces the
      // draft document with a new one. Review this behavior.
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documentVersion = await docsScope
        .getDocumentByPath({ commit, path })
        .then((r) => r.unwrap())

      const route = `/api/v3/projects/${project!.id}/versions/${commit!.uuid}/documents/${document.documentVersion.path}`
      const res = await app.request(route, {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      })

      const doc = await res.json()
      expect(doc).toEqual({
        versionUuid: commit.uuid,
        uuid: documentVersion.documentUuid,
        path: documentVersion.path,
        content: documentVersion.content,
        contentHash: documentVersion.contentHash,
        config: {
          model: 'foo',
          provider: providers[0]!.name,
          parameters: {
            myFile: { type: 'file' },
          },
        },
        parameters: {
          myFile: { type: 'file' },
          name: { type: 'text' },
        },
        provider: providers[0]!.provider,
      })
    })
  })
})
