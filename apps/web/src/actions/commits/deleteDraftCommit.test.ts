import * as factories from '@latitude-data/core/factories'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { deleteDraftCommitAction } from '$/actions/commits/deleteDraftCommitAction'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Commit,
  type Project,
  type ProviderApiKey,
  type User,
  type Workspace,
} from '@latitude-data/core/schema/types'

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

describe('deleteDraftCommitAction', () => {
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
      const { serverError } = await deleteDraftCommitAction({
        projectId: project.id,
        id: commit.id,
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
      const { serverError } = await deleteDraftCommitAction({
        projectId: 33,
        id: commit.id,
      })

      expect(serverError).toEqual('Project not found')
    })

    it('returns error when commit does not belongs to project', async () => {
      const { user: unrelatedUser, project: urelatedProject } =
        await factories.createProject()
      const { commit: unrelatedCommit } = await factories.createDraft({
        project: urelatedProject,
        user: unrelatedUser,
      })
      const { serverError } = await deleteDraftCommitAction({
        projectId: project.id,
        id: unrelatedCommit.id,
      })

      expect(serverError).toEqual('Commit not found')
    })

    it('returns error when the commit is merged', async () => {
      const { serverError } = await deleteDraftCommitAction({
        projectId: project.id,
        id: commit.id,
      })
      expect(serverError).toEqual('Cannot modify a merged commit')
    })

    it('returns all draft commits', async () => {
      const { commit: draft } = await factories.createDraft({
        project,
        user,
      })
      const { data } = await deleteDraftCommitAction({
        projectId: project.id,
        id: draft.id,
      })

      expect(data?.id).toEqual(draft.id)
    })

    it('deletes associated documents with draft commit', async () => {
      const documentVersionsScope = new DocumentVersionsRepository(workspace.id)

      const before = await documentVersionsScope
        .findAll()
        .then((r) => r.unwrap())

      const { commit: draft } = await factories.createDraft({
        project,
        user,
      })
      const { commit: anotherDraf } = await factories.createDraft({
        project,
        user,
      })
      await factories.createDocumentVersion({
        workspace,
        user,
        commit: draft,
        path: 'patata/doc1',
        content: factories.helpers.createPrompt({ provider }),
      })
      await factories.createDocumentVersion({
        workspace,
        user,
        commit: anotherDraf,
        path: 'patata/doc2',
        content: factories.helpers.createPrompt({ provider }),
      })

      await deleteDraftCommitAction({
        projectId: project.id,
        id: draft.id,
      })

      const after = await documentVersionsScope
        .findAll()
        .then((r) => r.unwrap())

      expect(after.length - before.length).toEqual(1)
    })
  })
})
