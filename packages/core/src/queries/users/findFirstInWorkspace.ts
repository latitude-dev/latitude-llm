import { asc } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { users } from '../../schema/models/users'
import { type WorkspaceUsersScope } from './scope'

export async function findFirstUserInWorkspace(scope: WorkspaceUsersScope) {
  const results = await scope.base().orderBy(asc(users.createdAt)).limit(1)
  return results[0] as User
}
