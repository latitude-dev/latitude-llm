/**
 * Updates the role of a workspace membership.
 */
import { eq } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { memberships } from '../../schema/models/memberships'
import { Membership } from '../../schema/models/types/Membership'
import { WorkspaceRole } from '../../permissions/workspace'

export async function updateMembershipRole(
  membership: Membership,
  role: WorkspaceRole,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const [updated] = await tx
      .update(memberships)
      .set({ role })
      .where(eq(memberships.id, membership.id))
      .returning()

    return Result.ok(updated)
  })
}
