import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { PromisedResult } from '../../lib/Transaction'
import { findAllWorkspaceUsers } from '../../queries/users/findAllInWorkspace'

/**
 * Lists users that belong to a workspace.
 */
export async function findWorkspaceUsers(
  workspace: Workspace | WorkspaceDto,
  db = database,
): PromisedResult<User[], Error> {
  return findAllWorkspaceUsers({ workspaceId: workspace.id }, db)
}
