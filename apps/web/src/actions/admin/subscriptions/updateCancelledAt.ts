'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { cancelSubscription } from '@latitude-data/core/services/subscriptions/cancel'
import { z } from 'zod'
import { withAdmin } from '../../procedures'

export const updateSubscriptionCancelledAtAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      cancelledAt: z.string().nullable(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const workspace = await unsafelyFindWorkspace(parsedInput.workspaceId)
    if (!workspace) {
      throw new BadRequestError('Workspace not found')
    }

    const cancelledAt = parsedInput.cancelledAt
      ? new Date(parsedInput.cancelledAt)
      : null

    const updatedSubscription = await cancelSubscription({
      workspace,
      subscription: workspace.currentSubscription,
      userEmail: ctx.user.email,
      cancelledAt,
    }).then((r) => r.unwrap())

    return updatedSubscription
  })
