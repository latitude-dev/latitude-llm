import { eq } from 'drizzle-orm'
import type { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type Workspace } from '../../schema/models/types/Workspace'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaces } from '../../schema/models/workspaces'
import { publisher } from '../../events/publisher'

export type AssignStripeCustomerIdOrigin = 'webhook' | 'backoffice'

/**
 * Assigns a Stripe customer ID to a workspace.
 *
 * This links the workspace to a Stripe customer, enabling subscription
 * management through Stripe.
 */
export async function assignStripeCustomerId(
  {
    workspace,
    stripeCustomerId,
    userEmail,
    origin,
  }: {
    workspace: Workspace | WorkspaceDto
    stripeCustomerId: string
    userEmail: string
    origin: AssignStripeCustomerIdOrigin
  },
  transaction = new Transaction(),
) {
  return transaction.call<WorkspaceDto>(
    async (tx) => {
      await tx
        .update(workspaces)
        .set({ stripeCustomerId })
        .where(eq(workspaces.id, workspace.id))

      const updated = await unsafelyFindWorkspace(workspace.id, tx)
      if (!updated) {
        return Result.error(new NotFoundError('Workspace not found'))
      }

      return Result.ok(updated)
    },
    async (updated) => {
      publisher.publishLater({
        type: 'stripeCustomerIdAssigned',
        data: {
          workspaceId: updated.id,
          stripeCustomerId,
          userEmail,
          origin,
        },
      })
    },
  )
}
