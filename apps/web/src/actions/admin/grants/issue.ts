'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { issueGrant } from '@latitude-data/core/services/grants/issue'
import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { GrantSource, QuotaType } from '@latitude-data/core/constants'

export const issueGrantAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      type: z.nativeEnum(QuotaType),
      amount: z.union([z.number(), z.literal('unlimited')]),
      periods: z.number().optional(),
      workspaceId: z.number(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const workspace = await unsafelyFindWorkspace(input.workspaceId)
    if (!workspace) {
      throw new BadRequestError('Workspace not found')
    }

    const grant = await issueGrant({
      type: input.type,
      amount: input.amount,
      source: GrantSource.System,
      referenceId: ctx.user.id,
      workspace: workspace,
      periods: input.periods,
    }).then((r) => r.unwrap())

    return grant
  })
