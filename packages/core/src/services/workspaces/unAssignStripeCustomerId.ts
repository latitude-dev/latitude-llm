import { eq } from 'drizzle-orm'
import type { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type Workspace } from '../../schema/models/types/Workspace'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaces } from '../../schema/models/workspaces'
import { publisher } from '../../events/publisher'

/**
 * Removes the Stripe customer ID from a workspace.
 */
export async function unAssignStripeCustomerId(
  {
    workspace,
    userEmail,
  }: {
    workspace: Workspace | WorkspaceDto
    userEmail: string
  },
  transaction = new Transaction(),
) {
  return transaction.call<WorkspaceDto>(
    async (tx) => {
      await tx
        .update(workspaces)
        .set({ stripeCustomerId: null })
        .where(eq(workspaces.id, workspace.id))

      const updated = await unsafelyFindWorkspace(workspace.id, tx)
      if (!updated) {
        return Result.error(new NotFoundError('Workspace not found'))
      }

      return Result.ok(updated)
    },
    async (updated) => {
      publisher.publishLater({
        type: 'stripeCustomerIdUnassigned',
        data: {
          workspaceId: updated.id,
          userEmail,
        },
      })
    },
  )
}
