import * as factories from '@latitude-data/core/factories'
import { helpers } from '@latitude-data/core/factories'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { publishDraftCommitAction } from '$/actions/commits/publishDraftCommitAction'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@latitude-data/constants'
import {
  type Commit,
  type DocumentVersion,
  type Project,
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
let document: DocumentVersion
describe('publishDraftCommitAction', () => {
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
      const [_, error] = await publishDraftCommitAction({
        projectId: project.id,
        id: commit.id,
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
      const [_, error] = await publishDraftCommitAction({
        projectId: 999992,
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
      const [_, error] = await publishDraftCommitAction({
        projectId: project.id,
        id: unrelatedCommit.id,
      })

      expect(error!.name).toEqual('NotFoundError')
    })

    it('returns error when the commit is merged', async () => {
      const [_, error] = await publishDraftCommitAction({
        projectId: project.id,
        id: commit.id,
      })
      expect(error!.name).toEqual('BadRequestError')
    })

    it('merge the commit', async () => {
      const { commit: draft } = await factories.createDraft({
        project,
        user,
      })
      await updateDocument({
        document,
        content: 'conentt updated',
        commit: draft,
      }).then((r) => r.unwrap())
      const [data] = await publishDraftCommitAction({
        projectId: project.id,
        id: draft.id,
      })

      expect(data?.mergedAt).not.toBeNull()
    })
  })
})
