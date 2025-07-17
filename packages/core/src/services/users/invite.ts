import { eq } from 'drizzle-orm'

import { User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
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

    publisher.publishLater({
      type: 'userInvited',
      data: {
        invited: user,
        invitee: author,
        userEmail: author.email,
        workspaceId: workspace.id,
      },
    })

    return Result.ok(user)
  }, db)
}
