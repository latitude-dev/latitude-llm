import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'

import { countCompletedRunsBySource } from '@latitude-data/core/services/runs/completed/countCompletedBySource'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
        }
        workspace: Workspace
      },
    ) => {
      const { projectId } = params

      const countBySource = await countCompletedRunsBySource({
        workspaceId: workspace.id,
        projectId,
      }).then((r) => r.unwrap())

      return NextResponse.json({ countBySource }, { status: 200 })
    },
  ),
)
