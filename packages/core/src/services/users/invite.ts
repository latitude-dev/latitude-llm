import { eq } from 'drizzle-orm'

import { User, Workspace } from '../../schema/types'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { users } from '../../schema/models/users'
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
  transaction = new Transaction(),
) {
  return transaction.call(
    async (tx) => {
      let user = await tx.query.users.findFirst({
        where: eq(users.email, email),
      })
      if (!user) {
        const result = await createUser({ email, name }, transaction)
        user = result.unwrap()
      }

      await createMembership({ author, user, workspace }, transaction).then(
        (r) => r.unwrap(),
      )

      return Result.ok(user)
    },
    (u) => {
      publisher.publishLater({
        type: 'userInvited',
        data: {
          invited: u,
          invitee: author,
          userEmail: author.email,
          workspaceId: workspace.id,
        },
      })
    },
  )
}
