import { WorkspaceDto } from '@latitude-data/core/browser'
import { computeWorkspaceUsage } from '@latitude-data/core/services/workspaces/usage'
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
        workspace: WorkspaceDto
      },
    ) => {
      const usage = await computeWorkspaceUsage(workspace).then((r) =>
        r.unwrap(),
      )

      return NextResponse.json(usage)
    },
  ),
)
