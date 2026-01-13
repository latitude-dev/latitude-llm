import { eq } from 'drizzle-orm'

import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { WorkspaceRole } from '../../permissions/workspace'
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
    role,
  }: {
    email: string
    name: string
    workspace: Workspace
    author: User
    role?: WorkspaceRole
  },
  transaction = new Transaction(),
) {
  return transaction.call(
    async (tx) => {
      let user = await tx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
        .then((rows) => rows[0])
      if (!user) {
        const result = await createUser({ email, name }, transaction)
        user = result.unwrap()
      }

      await createMembership(
        { author, user, workspace, role: role ?? 'admin' },
        transaction,
      ).then((r) => r.unwrap())

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
