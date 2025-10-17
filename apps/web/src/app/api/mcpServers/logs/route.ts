import { McpServerRepository } from '@latitude-data/core/repositories'
import {
  getLogs,
  LogOptions,
} from '@latitude-data/core/services/mcpServers/getLogs'
import { Result } from '@latitude-data/core/lib/Result'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      // Extract mcpServerId from the URL
      const searchParams = request.nextUrl.searchParams
      const mcpServerId = searchParams.get('mcpServerId')

      if (!mcpServerId) {
        return NextResponse.json(
          { error: 'Missing mcpServerId parameter' },
          { status: 400 },
        )
      }

      // Extract log options from query parameters
      const logOptions: LogOptions = {
        tailLines: searchParams.get('tailLines')
          ? parseInt(searchParams.get('tailLines') as string, 10)
          : 100,
        timestamps: searchParams.get('timestamps') !== 'false',
        previous: searchParams.get('previous') === 'true',
        limitBytes: searchParams.get('limitBytes')
          ? parseInt(searchParams.get('limitBytes') as string, 10)
          : undefined,
      }

      // Find the MCP server
      const repository = new McpServerRepository(workspace.id)
      const mcpServerResult = await repository.find(mcpServerId)

      if (!Result.isOk(mcpServerResult)) {
        return NextResponse.json(
          { error: mcpServerResult.error.message },
          { status: 404 },
        )
      }

      const mcpServer = mcpServerResult.value

      // Get logs
      const logsResult = await getLogs(mcpServer, logOptions)

      if (!Result.isOk(logsResult)) {
        return NextResponse.json(
          { error: logsResult.error.message },
          { status: 500 },
        )
      }

      return NextResponse.json({ logs: logsResult.value }, { status: 200 })
    },
  ),
)
