import { eq } from 'drizzle-orm'

import { type Membership } from '../../schema/models/types/Membership'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { memberships } from '../../schema/models/memberships'
import { publisher } from '../../events/publisher'

/**
 * Updates the escalating issues email preference for a membership
 */
export const updateEscalatingIssuesEmailPreference = async (
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
        .set({ wantToReceiveEscalatingIssuesEmail: wantToReceive })
        .where(eq(memberships.id, membership.id))
        .returning()

      const updated = updates[0]!

      return Result.ok(updated)
    },
    async (membership) => {
      publisher.publishLater({
        type: 'escalatingIssuesEmailPreferenceUpdated',
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
