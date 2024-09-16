import { eq } from 'drizzle-orm'

import { User, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { users } from '../../schema'
import { createMembership } from '../memberships/create'
import { createUser } from './createUser'

export async function inviteUser(
  {
    name,
    email,
    workspace,
    author,
  }: {
    email: string
    name: string
    workspace: Workspace
    author: User
  },
  db = database,
) {
  let user = await db.query.users.findFirst({ where: eq(users.email, email) })

  return Transaction.call(async (tx) => {
    if (!user) {
      const result = await createUser({ email, name })
      user = result.unwrap()
    }

    await createMembership({ author, user, workspace }, tx).then((r) =>
      r.unwrap(),
    )

    return Result.ok(user)
  }, db)
}
