import { inArray, eq } from 'drizzle-orm'

import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import { users } from '../../../schema/models/users'
import { memberships } from '../../../schema/models/memberships'
import { workspaces } from '../../../schema/models/workspaces'

export type UserSearchResult = {
  id: string
  email: string
  workspaces: {
    id: number
    name: string
  }[]
}

export async function searchUsersByEmails(emails: string[], db = database) {
  try {
    if (emails.length === 0) {
      return Result.ok([])
    }

    // First, get users that match the provided emails
    const foundUsers = await db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.email, emails))

    // Then, for each user, get their workspaces
    const usersWithWorkspaces = await Promise.all(
      foundUsers.map(async (user) => {
        const userWorkspaces = await db
          .select({
            id: workspaces.id,
            name: workspaces.name,
          })
          .from(memberships)
          .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
          .where(eq(memberships.userId, user.id))

        return {
          id: user.id,
          email: user.email,
          workspaces: userWorkspaces,
        }
      }),
    )

    return Result.ok(usersWithWorkspaces)
  } catch (error) {
    return Result.error(error as Error)
  }
}
