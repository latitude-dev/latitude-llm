import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { listTools } from '@latitude-data/core/services/integrations/index'
import { LatitudeTool, McpTool } from '@latitude-data/constants'
import { getLatitudeToolDefinition } from '@latitude-data/core/services/latitudeTools/helpers'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          integrationName: string
        }
        workspace: Workspace
      },
    ) => {
      if (params.integrationName === 'latitude') {
        const latitudeTools: McpTool[] = Object.values(LatitudeTool).map(
          (latitudeTool) => {
            const toolDefinition = getLatitudeToolDefinition(latitudeTool)!
            return {
              name: latitudeTool,
              description: toolDefinition.description,
              inputSchema: toolDefinition.parameters,
            }
          },
        )
        return NextResponse.json(
          {
            ok: true,
            data: latitudeTools,
          },
          { status: 200 },
        )
      }

      const integrationsScope = new IntegrationsRepository(workspace.id)
      const integration = await integrationsScope
        .findByName(params.integrationName)
        .then((r) => r.unwrap())

      // const toolList = await listTools(integration).then((r) => r.unwrap())
      const result = await listTools(integration)

      if (result.error) {
        return NextResponse.json(
          {
            ok: false,
            errorMessage: result.error.message,
          },
          { status: 200 },
        )
      }

      return NextResponse.json(
        {
          ok: true,
          data: result.unwrap(),
        },
        { status: 200 },
      )
    },
  ),
)
