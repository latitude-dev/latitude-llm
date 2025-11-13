'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { changeWorkspacePlan } from '@latitude-data/core/services/workspaces/changePlan'
import { SubscriptionPlan } from '@latitude-data/core/plans'
import { z } from 'zod'
import { withAdmin } from '../../procedures'

export const changeWorkspacePlanAction = withAdmin
  .inputSchema(
    z.object({
      workspaceId: z.number(),
      plan: z.nativeEnum(SubscriptionPlan),
    }),
  )
  .action(async ({ parsedInput }) => {
    const workspace = await unsafelyFindWorkspace(parsedInput.workspaceId)
    if (!workspace) {
      throw new BadRequestError('Workspace not found')
    }

    const updatedWorkspace = await changeWorkspacePlan(
      workspace,
      parsedInput.plan,
    ).then((r) => r.unwrap())

    return updatedWorkspace
  })
