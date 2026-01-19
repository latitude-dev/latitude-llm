'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { assignStripeCustomerId } from '@latitude-data/core/services/workspaces/assignStripeCustomerId'
import { unAssignStripeCustomerId } from '@latitude-data/core/services/workspaces/unAssignStripeCustomerId'
import { z } from 'zod'
import { withAdmin } from '../../procedures'

export const assignStripeCustomerIdAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      stripeCustomerId: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const workspace = await unsafelyFindWorkspace(parsedInput.workspaceId)
    if (!workspace) {
      throw new BadRequestError('Workspace not found')
    }

    if (!parsedInput.stripeCustomerId) {
      const updatedWorkspace = await unAssignStripeCustomerId({
        workspace,
        userEmail: ctx.user.email,
      }).then((r) => r.unwrap())
      return updatedWorkspace
    }

    const updatedWorkspace = await assignStripeCustomerId({
      workspace,
      stripeCustomerId: parsedInput.stripeCustomerId,
      userEmail: ctx.user.email,
      origin: 'backoffice',
    }).then((r) => r.unwrap())

    return updatedWorkspace
  })
