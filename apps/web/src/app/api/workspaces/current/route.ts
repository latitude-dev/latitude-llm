import type { WorkspaceDto } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'

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
      return NextResponse.json(workspace, { status: 200 })
    },
  ),
)
