import { Membership, User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
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
  db = database,
) => {
  const result = await Transaction.call(async (tx) => {
    const result = await tx
      .insert(memberships)
      .values({ userId: user.id, workspaceId: workspace.id, ...rest })
      .returning()
    const m = result[0]!

    return Result.ok(m)
  }, db)

  if (result.error) return result

  publishEvent({ membership: result.value, author })

  return result
}

const publishEvent = ({
  membership,
  author,
}: {
  membership: Membership
  author?: User
}) => {
  publisher.publishLater({
    type: 'membershipCreated',
    data: {
      ...membership,
      authorId: author?.id,
      userEmail: author?.email,
    },
  })
}
