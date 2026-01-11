import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { PromisedResult } from '../../lib/Transaction'
import { UsersRepository, WorkspaceUser } from '../../repositories'

/**
 * Lists users that belong to a workspace.
 */
export async function findWorkspaceUsers(
  workspace: Workspace | WorkspaceDto,
  db = database,
): PromisedResult<WorkspaceUser[], Error> {
  const repo = new UsersRepository(workspace.id, db)
  return repo.findAll()
}
