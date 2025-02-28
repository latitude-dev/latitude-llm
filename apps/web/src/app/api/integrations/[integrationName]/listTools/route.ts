import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { listTools } from '@latitude-data/core/services/integrations/index'

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
      const integrationsScope = new IntegrationsRepository(workspace.id)
      const integration = await integrationsScope
        .findByName(params.integrationName)
        .then((r) => r.unwrap())

      const toolList = await listTools(integration).then((r) => r.unwrap())

      return NextResponse.json(toolList, { status: 200 })
    },
  ),
)
