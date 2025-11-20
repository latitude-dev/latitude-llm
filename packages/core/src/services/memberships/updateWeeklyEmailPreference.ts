import { eq } from 'drizzle-orm'

import { type Membership } from '../../schema/models/types/Membership'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { memberships } from '../../schema/models/memberships'
import { publisher } from '../../events/publisher'

/**
 * Updates the weekly email preference for a membership
 */
export const updateWeeklyEmailPreference = async (
  {
    membership,
    wantToReceive,
    userEmail,
  }: {
    membership: Membership
    wantToReceive: boolean
    userEmail: string
  },
  transaction = new Transaction(),
) => {
  return transaction.call(
    async (tx) => {
      const updates = await tx
        .update(memberships)
        .set({ wantToReceiveWeeklyEmail: wantToReceive })
        .where(eq(memberships.id, membership.id))
        .returning()

      const updated = updates[0]!

      return Result.ok(updated)
    },
    async (membership) => {
      publisher.publishLater({
        type: 'weeklyEmailPreferenceUpdated',
        data: {
          workspaceId: membership.workspaceId,
          userId: membership.userId,
          userEmail,
          wantToReceive,
        },
      })
    },
  )
}
