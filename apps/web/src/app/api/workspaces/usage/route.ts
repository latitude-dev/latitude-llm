import { WorkspaceUsage } from '@latitude-data/core/browser'
import { computeWorkspaceUsage } from '@latitude-data/core/services/workspaces/usage'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = {}

export const GET = errorHandler<IParam, WorkspaceUsage>(
  authHandler<IParam, WorkspaceUsage>(
    async (_: NextRequest, _res: NextResponse, { workspace }) => {
      const usage = await computeWorkspaceUsage(workspace).then((r) =>
        r.unwrap(),
      )
      return NextResponse.json(usage, { status: 200 })
    },
  ),
)
