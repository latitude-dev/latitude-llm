'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { issueGrant } from '@latitude-data/core/services/grants/issue'
import { z } from 'zod'
import { withAdmin } from '../../procedures'
import { GrantSource, QuotaType } from '@latitude-data/core/constants'

export const issueGrantAction = withAdmin
  .inputSchema(
    z.object({
      type: z.enum(QuotaType),
      amount: z.union([z.number(), z.literal('unlimited')]),
      periods: z.number().optional(),
      workspaceId: z.number(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const workspace = await unsafelyFindWorkspace(parsedInput.workspaceId)
    if (!workspace) {
      throw new BadRequestError('Workspace not found')
    }

    const grant = await issueGrant({
      type: parsedInput.type,
      amount: parsedInput.amount,
      source: GrantSource.System,
      referenceId: ctx.user.id,
      workspace: workspace,
      periods: parsedInput.periods,
    }).then((r) => r.unwrap())

    return grant
  })
