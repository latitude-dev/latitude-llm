import { RunSourceGroup } from '@latitude-data/constants'
import { countCompletedRunsBySource } from '@latitude-data/core/services/runs/completed/countBySource'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

import { errorHandler } from '$/middlewares/errorHandler'
import { authHandler } from '$/middlewares/authHandler'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { projectId: number }
        workspace: Workspace
      },
    ) => {
      const { projectId } = params
      const searchParams = request.nextUrl.searchParams
      const sourceGroup = searchParams.get('sourceGroup') as
        | RunSourceGroup
        | undefined

      const countBySource = await countCompletedRunsBySource({
        workspaceId: workspace.id,
        projectId,
        sourceGroup,
      }).then((r) => r.unwrap())

      return NextResponse.json({ countBySource }, { status: 200 })
    },
  ),
)
