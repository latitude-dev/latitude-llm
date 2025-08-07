import {
  Providers,
  type DocumentVersion,
  type Project,
  type User,
  type Workspace,
} from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { helpers } from '@latitude-data/core/factories'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { createDraftWithContentAction } from '$/actions/commits/createDraftWithContentAction'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
let document: DocumentVersion

describe('createDraftWithContentAction', () => {
  beforeEach(async () => {
    const {
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
    document = docs[0]!
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const [_, error] = await createDraftWithContentAction({
        projectId: project.id,
        title: 'New Draft',
        description: 'Draft Description',
        documentUuid: document.documentUuid,
        content: 'New content',
      })

      expect(error!.name).toEqual('UnauthorizedError')
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
      const [_, error] = await createDraftWithContentAction({
        projectId: 999992,
        title: 'New Draft',
        description: 'Draft Description',
        documentUuid: document.documentUuid,
        content: 'New content',
      })

      expect(error!.name).toEqual('NotFoundError')
    })

    it('returns error when document is not found', async () => {
      const [_, error] = await createDraftWithContentAction({
        projectId: project.id,
        title: 'New Draft',
        description: 'Draft Description',
        documentUuid: generateUUIDIdentifier(),
        content: 'New content',
      })

      expect(error!.name).toEqual('NotFoundError')
    })

    it('creates a draft and updates document content', async () => {
      const newContent = 'Updated content'
      const [draft, error] = await createDraftWithContentAction({
        projectId: project.id,
        title: 'New Draft',
        description: 'Draft Description',
        documentUuid: document.documentUuid,
        content: newContent,
      })

      expect(error).toBeNull()

      const docsRepo = new DocumentVersionsRepository(workspace.id)
      const newDocumentVersion = await docsRepo
        .getDocumentAtCommit({
          projectId: project.id,
          commitUuid: draft!.uuid,
          documentUuid: document.documentUuid,
        })
        .then((r) => r.unwrap())

      expect(draft!.mergedAt).toBeNull()
      expect(draft!.title).toEqual('New Draft')

      expect(newDocumentVersion.content).toEqual(newContent)
    })
  })
})
