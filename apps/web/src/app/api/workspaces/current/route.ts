import { WorkspaceDto } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = {}
export const GET = errorHandler<IParam, WorkspaceDto>(
  authHandler<IParam, WorkspaceDto>(
    async (_: NextRequest, _res: NextResponse, { workspace }) => {
      return NextResponse.json(workspace, { status: 200 })
    },
  ),
)
