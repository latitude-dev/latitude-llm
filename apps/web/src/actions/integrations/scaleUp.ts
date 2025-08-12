'use server'

import { McpServerRepository } from '@latitude-data/core/repositories'
import { scaleMcpServer } from '@latitude-data/core/services/mcpServers/scaleService'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const scaleUpMcpServerAction = authProcedure
  .inputSchema(z.object({ mcpServerId: z.number() }))
  .action(async ({ parsedInput, ctx }) => {
    const mcpServerRepo = new McpServerRepository(ctx.workspace.id)
    const mcpServer = await mcpServerRepo
      .find(parsedInput.mcpServerId)
      .then((r) => r.unwrap())

    return scaleMcpServer({
      mcpServer,
      replicas: 1,
    }).then((r) => r.unwrap())
  })
