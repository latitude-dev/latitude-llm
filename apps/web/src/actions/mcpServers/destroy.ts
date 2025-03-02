'use server'

import { McpServerRepository } from '@latitude-data/core/repositories'
import { destroyMcpServer } from '@latitude-data/core/services/mcpServers/destroyService'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyMcpServerAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const mcpServersRepo = new McpServerRepository(ctx.workspace.id)
    const mcpServer = await mcpServersRepo
      .find(input.id)
      .then((r) => r.unwrap())

    await destroyMcpServer(mcpServer).then((r) => r.unwrap())

    return mcpServer
  })
