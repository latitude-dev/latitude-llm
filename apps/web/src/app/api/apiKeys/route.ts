import { findAllApiKeys } from '@latitude-data/core/queries/apiKeys/findAll'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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
      const rows = await findAllApiKeys({ workspaceId: workspace.id })
      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
