import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { listIntegrations } from '@latitude-data/core/services/integrations/list'
import { Workspace } from '@latitude-data/core/schema/types'

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
      const integrations = await listIntegrations(workspace).then((r) =>
        r.unwrap(),
      )
      console.log('Integrations:', integrations)
      return NextResponse.json(integrations, { status: 200 })
    },
  ),
)
