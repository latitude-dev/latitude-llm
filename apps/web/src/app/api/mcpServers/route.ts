import { Workspace } from '@latitude-data/core/browser'
import { McpServerRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const repository = new McpServerRepository(workspace.id)
      const mcpServers = await repository.findAllActive()

      return NextResponse.json(mcpServers, { status: 200 })
    },
  ),
)
