import type { Membership, User, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { memberships } from '../../schema'
export const createMembership = async (
  {
    author,
    user,
    workspace,
    ...rest
  }: {
    user: User
    workspace: Workspace
    author?: User
  } & Partial<Omit<Membership, 'userId' | 'workspaceId'>>,
  transaction = new Transaction(),
) => {
  const result = await transaction.call(
    async (tx) => {
      const result = await tx
        .insert(memberships)
        .values({ userId: user.id, workspaceId: workspace.id, ...rest })
        .returning()
      const m = result[0]!

      return Result.ok(m)
    },
    (m) => publishEvent({ membership: m, author }),
  )

  if (result.error) return result

  return result
}

const publishEvent = ({ membership, author }: { membership: Membership; author?: User }) => {
  publisher.publishLater({
    type: 'membershipCreated',
    data: {
      ...membership,
      authorId: author?.id,
      userEmail: author?.email,
    },
  })
}
