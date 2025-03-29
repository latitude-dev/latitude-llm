import { Workspace } from '@latitude-data/core'
import { listWebhooks } from '@latitude-data/core'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
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
      return NextResponse.json(await listWebhooks(workspace.id))
    },
  ),
)
