'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { updateTrialEndsAt } from '@latitude-data/core/services/subscriptions/updateTrialEndsAt'
import { z } from 'zod'
import { withAdmin } from '../../procedures'

export const updateSubscriptionTrialEndsAtAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      trialEndsAt: z.string().nullable(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const workspace = await unsafelyFindWorkspace(parsedInput.workspaceId)
    if (!workspace) {
      throw new BadRequestError('Workspace not found')
    }

    const trialEndsAt = parsedInput.trialEndsAt
      ? new Date(parsedInput.trialEndsAt)
      : null

    const updatedSubscription = await updateTrialEndsAt({
      subscription: workspace.currentSubscription,
      trialEndsAt,
    }).then((r) => r.unwrap())

    return updatedSubscription
  })
