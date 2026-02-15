import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { findIntegrationByName } from '@latitude-data/core/queries/integrations/findByName'
import { listTools } from '@latitude-data/core/services/integrations/index'
import { LATITUDE_TOOLS } from '@latitude-data/core/services/latitudeTools/tools'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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
        const latitudeTools = LATITUDE_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.definition().description,
          inputSchema: z.toJSONSchema(
            tool.definition().inputSchema as z.ZodType,
            {
              target: 'openapi-3.0',
            },
          ),
        }))
        return NextResponse.json(
          {
            ok: true,
            data: latitudeTools,
          },
          { status: 200 },
        )
      }

      const integration = await findIntegrationByName({
        workspaceId: workspace.id,
        name: params.integrationName,
      })

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
