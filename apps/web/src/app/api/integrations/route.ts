import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { listIntegrations } from '@latitude-data/core/services/integrations/list'

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
      return NextResponse.json(integrations, { status: 200 })
    },
  ),
)
