import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'

import { countActiveRunsBySource } from '@latitude-data/core/services/runs/active/countActiveBySource'
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

      const countBySource = await countActiveRunsBySource({
        workspaceId: workspace.id,
        projectId,
      }).then((r) => r.unwrap())

      return NextResponse.json({ countBySource }, { status: 200 })
    },
  ),
)
