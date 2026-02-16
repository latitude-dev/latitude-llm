import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { users } from '../../schema/models/users'
import { unscopedQuery } from '../scope'
import { database } from '../../client'

/**
 * Returns the workspace creator user, or null if the workspace has no creator or the user was deleted.
 */
export const findWorkspaceCreator = unscopedQuery(
  async function findWorkspaceCreator(
    { workspace }: { workspace: Pick<Workspace, 'creatorId'> },
    db = database,
  ): Promise<User | null> {
    if (!workspace.creatorId) return null
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, workspace.creatorId))
      .limit(1)
    return (rows[0] as User) ?? null
  },
)
