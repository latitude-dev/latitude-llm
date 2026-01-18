import { eq } from 'drizzle-orm'
import type { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type Workspace } from '../../schema/models/types/Workspace'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaces } from '../../schema/models/workspaces'

export type AssignStripeCustomerIdOrigin = 'webhook' | 'backoffice'

/**
 * Assigns a Stripe customer ID to a workspace.
 *
 * This links the workspace to a Stripe customer, enabling subscription
 * management through Stripe.
 *
 * @param workspace - The workspace to update
 * @param stripeCustomerId - The Stripe customer ID to assign
 * @param origin - Where this assignment originated from:
 *   - 'webhook': From a Stripe webhook event (e.g., subscription.created)
 *   - 'backoffice': Manual assignment from the admin backoffice
 */
export async function assignStripeCustomerId(
  {
    workspace,
    stripeCustomerId,
    origin: _origin,
  }: {
    workspace: Workspace | WorkspaceDto
    stripeCustomerId: string
    origin: AssignStripeCustomerIdOrigin
  },
  transaction = new Transaction(),
) {
  return transaction.call<WorkspaceDto>(async (tx) => {
    await tx
      .update(workspaces)
      .set({ stripeCustomerId })
      .where(eq(workspaces.id, workspace.id))

    const updated = await unsafelyFindWorkspace(workspace.id, tx)
    if (!updated) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    return Result.ok(updated)
  })
}
