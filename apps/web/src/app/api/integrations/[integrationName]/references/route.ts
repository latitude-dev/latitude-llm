import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { findIntegrationByName } from '@latitude-data/core/queries/integrations/findByName'
import { listIntegrationReferences } from '@latitude-data/core/services/integrations/references'

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
        return NextResponse.json({ ok: true, data: [] }, { status: 200 })
      }

      const integration = await findIntegrationByName({
        workspaceId: workspace.id,
        name: params.integrationName,
      })

      const result = await listIntegrationReferences(integration)

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
