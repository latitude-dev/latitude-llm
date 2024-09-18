import type {
  Commit,
  Project,
  ProviderApiKey,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { database } from '@latitude-data/core/client'
import * as factories from '@latitude-data/core/factories'
import { deleteDraftCommitAction } from '$/actions/commits/deleteDraftCommitAction'
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
let commit: Commit
let provider: ProviderApiKey

describe('getUsersAction', () => {
  beforeEach(async () => {
    const {
      commit: cmt,
      workspace: wp,
      user: usr,
      project: prj,
      providers,
    } = await factories.createProject()
    user = usr
    workspace = wp
    project = prj
    commit = cmt
    provider = providers[0]!
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const [_, error] = await deleteDraftCommitAction({
        projectId: project.id,
        id: commit.id,
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockReturnValue({
        user,
        workspace: { id: workspace.id, name: workspace.name },
      })
    })

    it('returns error when project is not found', async () => {
      const [_, error] = await deleteDraftCommitAction({
        projectId: 33,
        id: commit.id,
      })

      expect(error!.name).toEqual('NotFoundError')
    })

    it('returns error when commit does not belongs to project', async () => {
      const { user: unrelatedUser, project: urelatedProject } =
        await factories.createProject()
      const { commit: unrelatedCommit } = await factories.createDraft({
        project: urelatedProject,
        user: unrelatedUser,
      })
      const [_, error] = await deleteDraftCommitAction({
        projectId: project.id,
        id: unrelatedCommit.id,
      })

      expect(error!.name).toEqual('NotFoundError')
    })

    it('returns error when the commit is merged', async () => {
      const [_, error] = await deleteDraftCommitAction({
        projectId: project.id,
        id: commit.id,
      })
      expect(error!.name).toEqual('BadRequestError')
    })

    it('returns all draft commits', async () => {
      const { commit: draft } = await factories.createDraft({
        project,
        user,
      })
      const [data] = await deleteDraftCommitAction({
        projectId: project.id,
        id: draft.id,
      })

      expect(data).toEqual(draft)
    })

    it('deletes associated documents with draft commit', async () => {
      const before = await database.query.documentVersions.findMany()

      const { commit: draft } = await factories.createDraft({
        project,
        user,
      })
      const { commit: anotherDraf } = await factories.createDraft({
        project,
        user,
      })
      await factories.createDocumentVersion({
        commit: draft,
        path: 'patata/doc1',
        content: factories.helpers.createPrompt({ provider }),
      })
      await factories.createDocumentVersion({
        commit: anotherDraf,
        path: 'patata/doc2',
        content: factories.helpers.createPrompt({ provider }),
      })

      await deleteDraftCommitAction({
        projectId: project.id,
        id: draft.id,
      })

      const after = await database.query.documentVersions.findMany()

      expect(after.length - before.length).toEqual(1)
    })
  })
})
