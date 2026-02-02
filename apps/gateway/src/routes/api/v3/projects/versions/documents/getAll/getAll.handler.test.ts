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
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

vi.mock('$/jobs', () => ({
  queues: { jobs: { enqueueUpdateApiKeyProviderJob: vi.fn() } },
}))

describe('GET documents', () => {
  describe('unauthorized', () => {
    it('fails', async () => {
      const res = await app.request(
        '/api/v3/projects/1/versions/asldkfjhsadl/documents',
      )

      expect(res.status).toBe(401)
    })
  })

  describe('authorized', () => {
    let documentUuid: string
    let projectId: number
    let commit: Commit
    let headers: Record<string, unknown>
    let content: string
    let contentHash: string | undefined
    let providerName: string

    beforeAll(async () => {
      const { workspace, user, project, providers } = await createProject()
      const apiKey = await unsafelyGetFirstApiKeyByWorkspaceId({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())
      const path = 'path/to/document'
      const { commit: draft } = await createDraft({
        project,
        user,
      })
      await createDocumentVersion({
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
              // @ts-expect-error - type mismatch
              myFile: { type: 'file' },
            },
          },
        }),
      })

      commit = await mergeCommit(draft).then((r) => r.unwrap())
      // TODO: We refetch the document because merging a commit actually replaces the
      // draft document with a new one. Review this behavior.
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documentVersion = await docsScope
        .getDocumentByPath({ commit, path })
        .then((r) => r.unwrap())
      documentUuid = documentVersion.documentUuid
      content = documentVersion.content
      contentHash = documentVersion.contentHash ?? undefined
      projectId = project!.id
      headers = {
        headers: {
          Authorization: `Bearer ${apiKey!.token}`,
        },
      }
      providerName = providers[0]!.name
    })

    it('gets documents by commit uuid', async () => {
      const route = `/api/v3/projects/${projectId}/versions/${commit!.uuid}/documents`
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(data).toEqual([
        {
          versionUuid: commit.uuid,
          uuid: documentUuid,
          path: 'path/to/document',
          content: content,
          contentHash: contentHash,
          config: {
            model: 'foo',
            provider: providerName,
            parameters: {
              myFile: { type: 'file' },
            },
          },
          parameters: {
            myFile: { type: 'file' },
            name: { type: 'text' },
          },
          provider: 'openai',
        },
      ])
    })

    it('gets documents when live is passed', async () => {
      const route = `/api/v3/projects/${projectId}/versions/live/documents`
      const res = await app.request(route, headers)
      const data = await res.json()

      expect(data).toEqual([
        {
          versionUuid: commit.uuid,
          uuid: documentUuid,
          path: 'path/to/document',
          content: content,
          contentHash: contentHash,
          config: {
            model: 'foo',
            provider: providerName,
            parameters: {
              myFile: { type: 'file' },
            },
          },
          parameters: {
            myFile: { type: 'file' },
            name: { type: 'text' },
          },
          provider: 'openai',
        },
      ])
    })
  })
})
