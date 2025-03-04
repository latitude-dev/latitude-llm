'use server'

import { z } from 'zod'
import { McpServerRepository } from '@latitude-data/core/repositories'
import { updateMcpServerStatus } from '@latitude-data/core/services/mcpServers/index'

import { authProcedure } from '../procedures'

export const updateMcpServerStatusAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      mcpServerId: z.number(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    // Fetch the MCP server record from the database
    const repo = new McpServerRepository(ctx.workspace.id)
    const mcpServerRecord = await repo
      .find(input.mcpServerId)
      .then((r) => r.unwrap())

    return await updateMcpServerStatus(mcpServerRecord).then((r) => r.unwrap())
  })
