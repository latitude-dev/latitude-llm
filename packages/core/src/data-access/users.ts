import { type User } from '../schema/models/types/User'
import { type Workspace } from '../schema/models/types/Workspace'
import { WorkspaceDto } from '../schema/models/types/Workspace'
import { database, Database } from '../client'
import { workspaceUsersScope, usersScope } from '../queries/users/scope'
import { findFirstUserInWorkspace as _findFirstUserInWorkspace } from '../queries/users/findFirstInWorkspace'
import { unsafelyFindUserById } from '../queries/users/findById'
import {
  unsafelyFindUserByEmail as _unsafelyFindUserByEmail,
  unsafelyFindUserIdByEmail,
} from '../queries/users/findByEmail'

/** @deprecated Use `findFirstUserInWorkspace` from `queries/users/findFirstInWorkspace` */
export async function findFirstUserInWorkspace(
  workspace: WorkspaceDto | Workspace,
) {
  const scope = workspaceUsersScope(workspace.id)
  return _findFirstUserInWorkspace(scope)
}

/** @deprecated Use `unsafelyFindUserById` from `queries/users/findById` */
export function unsafelyGetUser(id?: string) {
  const scope = usersScope()
  return unsafelyFindUserById(scope, id ?? '') as Promise<User | null>
}

/** @deprecated Use `unsafelyFindUserByEmail` from `queries/users/findByEmail` */
export function unsafelyGetUserByEmail(email?: string) {
  const scope = usersScope()
  return _unsafelyFindUserByEmail(scope, email ?? '') as Promise<User | null>
}

/** @deprecated Use `unsafelyFindUserIdByEmail` from `queries/users/findByEmail` */
export async function unsafelyFindUserByEmail(
  email: string,
  db: Database = database,
) {
  const scope = usersScope(db)
  return unsafelyFindUserIdByEmail(scope, email)
}
