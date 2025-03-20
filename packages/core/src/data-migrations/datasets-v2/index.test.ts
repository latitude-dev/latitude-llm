import { describe, beforeAll, it, vi, expect } from 'vitest'
import * as factories from '../../tests/factories'
import { Workspace } from '../../browser'

import { migrateDatasetsV1ToV2 } from './index'
import { migrateWorkspaceDatasetsToV2 } from './utils/migrateWorkspaceDatasetsToV2'

function mockMigractor() {
  return vi.fn((_args: Parameters<typeof migrateWorkspaceDatasetsToV2>[0]) =>
    Promise.resolve({
      workspaceId: 1,
      errors: [],
      migratedDatasets: [],
    }),
  )
}

let workspaceWithoutDatasetsWorkspace: Workspace
describe('datasets v2 migration', () => {
  beforeAll(async () => {
    const { workspace: wp } = await factories.createWorkspace()
    workspaceWithoutDatasetsWorkspace = wp
  })

  describe('workspaces without datasets', () => {
    it('should not call migrator', async () => {
      const migratorMock = vi.fn()
      await migrateDatasetsV1ToV2({
        targetWorkspaces: [workspaceWithoutDatasetsWorkspace.id],
        workspaceMigrator: migratorMock,
      })
      expect(migratorMock).not.toHaveBeenCalled()
    })
  })

  describe('workspaces with datasets', () => {
    let workspaceOne: Workspace
    let workspaceTwo: Workspace

    beforeAll(async () => {
      const one = await factories.createWorkspace({
        name: 'Workspace One',
      })

      const { currentSubscription: _cs1, ...restOne } = one.workspace
      workspaceOne = restOne
      await factories.createDataset({
        workspace: workspaceOne,
        name: 'File Workspace One',
        author: one.userData,
      })

      const two = await factories.createWorkspace({
        name: 'Workspace Two',
      })
      const { currentSubscription: _cs2, ...restTwo } = two.workspace
      workspaceTwo = restTwo
      await factories.createDataset({
        workspace: workspaceTwo,
        name: 'File Workspace Two',
        author: two.userData,
      })
    })

    it('it should call migrator on all workspaces with datasets', async () => {
      const migratorMock = mockMigractor()
      await migrateDatasetsV1ToV2({
        targetWorkspaces: 'all',
        workspaceMigrator: migratorMock,
      })
      expect(migratorMock).toHaveBeenNthCalledWith(1, {
        workspace: workspaceOne,
      })
      expect(migratorMock).toHaveBeenNthCalledWith(2, {
        workspace: workspaceTwo,
      })
    })

    it('should call migrator only on specified workspaces', async () => {
      const migratorMock = mockMigractor()
      await migrateDatasetsV1ToV2({
        targetWorkspaces: [workspaceOne.id],
        workspaceMigrator: migratorMock,
      })
      expect(migratorMock).toHaveBeenCalledTimes(1)
      expect(migratorMock).toHaveBeenNthCalledWith(1, {
        workspace: workspaceOne,
      })
      expect(migratorMock).not.toHaveBeenCalledWith({
        workspace: workspaceTwo,
      })
    })
  })
})
