import { User, Workspace, WorkspaceDto } from '../../schema/types'
import { database } from '../../client'
import { PromisedResult } from '../../lib/Transaction'
import { UsersRepository } from '../../repositories'

/**
 * Lists users that belong to a workspace.
 */
export async function findWorkspaceUsers(
  workspace: Workspace | WorkspaceDto,
  db = database,
): PromisedResult<User[], Error> {
  const repo = new UsersRepository(workspace.id, db)
  return repo.findAll()
}
