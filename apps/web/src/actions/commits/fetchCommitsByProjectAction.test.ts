import { CommitStatus } from '@latitude-data/core'
import type { Workspace } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCommitsByProjectAction } from './fetchCommitsByProjectAction'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

let workspace: Workspace
describe('getUsersAction', () => {
  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      const [_, error] = await fetchCommitsByProjectAction({
        status: CommitStatus.Draft,
        projectId: 1,
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      const { workspace: wp, userData } = await factories.createWorkspace({
        name: 'test',
      })
      workspace = wp
      mocks.getSession.mockReturnValue({
        user: userData,
        workspace: { id: workspace.id, name: workspace.name },
      })
    })

    it('returns error when project is not found', async () => {
      const [_, error] = await fetchCommitsByProjectAction({
        status: CommitStatus.Draft,
        projectId: 1,
      })

      expect(error!.name).toEqual('NotFoundError')
    })

    it('returns not found when project belongs to other workspce', async () => {
      const { workspace: otherWorkspace } = await factories.createWorkspace({
        name: 'test',
      })
      const { project } = await factories.createProject({
        workspace: otherWorkspace,
      })
      const [_, error] = await fetchCommitsByProjectAction({
        status: CommitStatus.Draft,
        projectId: project.id,
      })
      expect(error!.name).toEqual('NotFoundError')
    })

    it('returns all draft commits', async () => {
      const { project, user } = await factories.createProject({
        workspace: workspace,
      })
      await factories.createDraft({
        project,
        user,
      })
      const [data] = await fetchCommitsByProjectAction({
        status: CommitStatus.Draft,
        projectId: project.id,
      })

      expect(data?.length).toEqual(1)
    })
  })
})
