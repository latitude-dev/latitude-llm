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
        params,
      }: {
        workspace: Workspace
        params: { mcpServerId: string }
      },
    ) => {
      const { mcpServerId } = params

      if (!mcpServerId) {
        return NextResponse.json(
          { error: 'MCP Server ID is required' },
          { status: 400 },
        )
      }

      const repository = new McpServerRepository(workspace.id)
      const mcpServer = await repository
        .find(mcpServerId)
        .then((r) => r.unwrap())

      if (!mcpServer) {
        return NextResponse.json(
          { error: 'MCP Server not found' },
          { status: 404 },
        )
      }

      return NextResponse.json(mcpServer, { status: 200 })
    },
  ),
)
