import {
  Providers,
  type Commit,
  type DocumentVersion,
  type Project,
  type User,
  type Workspace,
} from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { helpers } from '@latitude-data/core/factories'
import { PublishedDocumentRepository } from '@latitude-data/core/repositories/publishedDocumentsRepository'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publishDocumentAction } from './publishDocumentAction'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

let workspace: Workspace
let project: Project
let user: User
let commit: Commit
let document: DocumentVersion

describe('publishDocumentAction', () => {
  beforeEach(async () => {
    const {
      commit: cmt,
      workspace: wp,
      user: usr,
      project: prj,
      documents: docs,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: helpers.createPrompt({ provider: 'openai', content: 'content' }),
      },
    })
    user = usr
    workspace = wp
    project = prj
    commit = cmt
    document = docs[0]!
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const { serverError } = await publishDocumentAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      expect(serverError).toEqual('Unauthorized')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    it('returns error when project is not found', async () => {
      const { serverError } = await publishDocumentAction({
        projectId: 999992,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      expect(serverError).toEqual('Project not found')
    })

    it('creates a new published document when document has not been published before', async () => {
      const { data } = await publishDocumentAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      expect(data!).toBeDefined()
      expect(data!.isPublished).toBe(true)
      expect(data!.documentUuid).toBe(document.documentUuid)
      expect(data!.workspaceId).toBe(workspace.id)
      expect(data!.projectId).toBe(project.id)
    })

    it('updates an existing published document when document was previously published', async () => {
      // First publish
      await publishDocumentAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      const scope = new PublishedDocumentRepository(workspace.id)
      const publishedDocs = await scope.findByProject(project.id)
      expect(publishedDocs.length).toBe(1)

      // Update the published document
      const { data } = await publishDocumentAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })

      expect(data!).toBeDefined()
      expect(data!.isPublished).toBe(true)
      expect(data!.documentUuid).toBe(document.documentUuid)

      // Verify no duplicate was created
      const updatedPublishedDocs = await scope.findByProject(project.id)
      expect(updatedPublishedDocs.length).toBe(1)
    })

    it('returns error when document does not belong to project', async () => {
      const { documents: otherDocs } = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          doc1: helpers.createPrompt({
            provider: 'openai',
            content: 'content',
          }),
        },
      })

      const { serverError } = await publishDocumentAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: otherDocs[0]!.documentUuid,
      })

      expect(serverError).toEqual('Document not found')
    })
  })
})
