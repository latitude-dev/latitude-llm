import { McpServerRepository } from '@latitude-data/core/repositories'
import { updateMcpServerStatus } from '@latitude-data/core/services/mcpServers/updateDeploymentStatus'
import { Result } from '@latitude-data/core/lib/Result'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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

export const POST = errorHandler(
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

      // Find the MCP server
      const repository = new McpServerRepository(workspace.id)
      const mcpServerResult = await repository.find(mcpServerId)

      if (!Result.isOk(mcpServerResult)) {
        return NextResponse.json(
          {
            error: `MCP Server with ID ${mcpServerId} not found: ${mcpServerResult.error.message}`,
          },
          { status: 404 },
        )
      }

      const mcpServer = mcpServerResult.value

      // Update the MCP server status
      const updateResult = await updateMcpServerStatus(mcpServer)

      if (!Result.isOk(updateResult)) {
        return NextResponse.json(
          {
            error: `Failed to update MCP server status: ${updateResult.error.message}`,
          },
          { status: 500 },
        )
      }

      // Return the updated MCP server
      return NextResponse.json(updateResult.value, { status: 200 })
    },
  ),
)
