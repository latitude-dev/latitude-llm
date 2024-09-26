'use server'

import { computeWorkspaceUsage } from '@latitude-data/core/services/workspaces/usage'

import { authProcedure } from '../procedures'

export const fetchWorkspaceUsageAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    return await computeWorkspaceUsage(ctx.workspace).then((r) => r.unwrap())
  })
