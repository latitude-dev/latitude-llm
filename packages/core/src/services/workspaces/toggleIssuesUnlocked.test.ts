import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../../tests/factories'
import { toggleIssuesUnlocked } from './toggleIssuesUnlocked'
import * as publisherModule from '../../events/publisher'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { Project } from '../../schema/models/types/Project'
import type { User } from '../../schema/models/types/User'
import { WorkspacesRepository } from '../../repositories'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('toggleIssuesUnlocked', () => {
  let workspace: Workspace
  let project: Project
  let user: User

  beforeAll(async () => {
    const setup = await createProject()
    workspace = setup.workspace
    project = setup.project
    user = setup.user
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when enabling issues unlocked', () => {
    it('should update the flag to true', async () => {
      const result = await toggleIssuesUnlocked({
        workspace,
        enabled: true,
        currentUserEmail: 'test@example.com',
        source: 'admin-action',
      })

      const updated = result.unwrap()
      expect(updated.issuesUnlocked).toBe(true)

      const repo = new WorkspacesRepository(user.id)
      const refreshed = await repo.find(workspace.id).then((r) => r.unwrap())
      expect(refreshed.issuesUnlocked).toBe(true)
    })

    it('should publish event when source is annotation', async () => {
      const result = await toggleIssuesUnlocked({
        workspace,
        enabled: true,
        currentUserEmail: 'test@example.com',
        source: 'annotation',
        projectId: project.id,
      })

      result.unwrap()

      expect(publisherModule.publisher.publishLater).toHaveBeenCalledTimes(1)
      expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceIssuesDashboardUnlocked',
        data: {
          userEmail: 'test@example.com',
          workspaceId: workspace.id,
          projectId: project.id,
        },
      })
    })

    it('should NOT publish event when source is admin-action', async () => {
      const result = await toggleIssuesUnlocked({
        workspace,
        enabled: true,
        currentUserEmail: 'admin@example.com',
        source: 'admin-action',
      })

      result.unwrap()

      expect(publisherModule.publisher.publishLater).not.toHaveBeenCalled()
    })
  })

  describe('when disabling issues unlocked', () => {
    it('should update the flag to false', async () => {
      // First enable it
      await toggleIssuesUnlocked({
        workspace,
        enabled: true,
        currentUserEmail: 'test@example.com',
        source: 'admin-action',
      })

      vi.clearAllMocks()

      // Then disable it
      const result = await toggleIssuesUnlocked({
        workspace,
        enabled: false,
        currentUserEmail: 'test@example.com',
        source: 'admin-action',
      })

      const updated = result.unwrap()
      expect(updated.issuesUnlocked).toBe(false)

      const repo = new WorkspacesRepository(user.id)
      const refreshed = await repo.find(workspace.id).then((r) => r.unwrap())
      expect(refreshed.issuesUnlocked).toBe(false)
    })

    it('should NOT publish event when disabling even with annotation source', async () => {
      const result = await toggleIssuesUnlocked({
        workspace,
        enabled: false,
        currentUserEmail: 'test@example.com',
        source: 'annotation',
        projectId: project.id,
      })

      result.unwrap()

      expect(publisherModule.publisher.publishLater).not.toHaveBeenCalled()
    })
  })

  describe('event data', () => {
    it('should include null userEmail when not provided', async () => {
      const result = await toggleIssuesUnlocked({
        workspace,
        enabled: true,
        currentUserEmail: null,
        source: 'annotation',
        projectId: project.id,
      })

      result.unwrap()

      expect(publisherModule.publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceIssuesDashboardUnlocked',
        data: {
          userEmail: null,
          workspaceId: workspace.id,
          projectId: project.id,
        },
      })
    })
  })
})
