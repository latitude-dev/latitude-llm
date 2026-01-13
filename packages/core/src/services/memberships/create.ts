import { type Membership } from '../../schema/models/types/Membership'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { memberships } from '../../schema/models/memberships'
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
        .values({
          userId: user.id,
          workspaceId: workspace.id,
          role: rest.role ?? 'admin',
          ...rest,
        })
        .returning()
      const m = result[0]!

      return Result.ok(m)
    },
    (m) => publishEvent({ membership: m, author }),
  )

  if (result.error) return result

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
