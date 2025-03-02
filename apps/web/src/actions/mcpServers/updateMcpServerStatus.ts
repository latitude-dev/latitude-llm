'use server'

import { z } from 'zod'
import { authProcedure } from '../procedures'
import { McpServerRepository } from '@latitude-data/core/repositories'
import { checkAndUpdateMcpServerStatus } from '@latitude-data/core/services/mcpServers/updateStatusService'

export const updateMcpServerStatusAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const repository = new McpServerRepository(ctx.workspace.id)
    const mcpApplicationResult = await repository.find(input.id)
    const mcpApplication = mcpApplicationResult.unwrap()
    const updatedMcpApplicationResult =
      await checkAndUpdateMcpServerStatus(mcpApplication)

    return updatedMcpApplicationResult.unwrap()
  })
