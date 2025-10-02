import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { WorkspaceDto } from '@latitude-data/core/schema/types'

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
