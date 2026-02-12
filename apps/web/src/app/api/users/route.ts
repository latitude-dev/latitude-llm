import { findAllWorkspaceUsers } from '@latitude-data/core/queries/users/findAllInWorkspace'
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
      const rows = await findAllWorkspaceUsers({
        workspaceId: workspace.id,
      }).then((r) => r.unwrap())

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
