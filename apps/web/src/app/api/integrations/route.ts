import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { listIntegrations } from '@latitude-data/core/services/integrations/list'
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
      const integrations = await listIntegrations(workspace).then((r) =>
        r.unwrap(),
      )
      return NextResponse.json(integrations, { status: 200 })
    },
  ),
)
