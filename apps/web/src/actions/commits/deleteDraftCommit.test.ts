import type {
  Commit,
  Project,
  SafeUser,
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
let user: SafeUser
let commit: Commit

describe('getUsersAction', () => {
  beforeEach(async () => {
    const {
      commit: cmt,
      workspace: wp,
      user: usr,
      project: prj,
    } = await factories.createProject()
    user = usr
    workspace = wp
    project = prj
    commit = cmt
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
      })
      await factories.createDocumentVersion({
        commit: anotherDraf,
        path: 'patata/doc2',
      })
      await deleteDraftCommitAction({
        projectId: project.id,
        id: draft.id,
      })

      const result = await database.query.documentVersions.findMany()
      expect(result.length).toEqual(1)
    })
  })
})
