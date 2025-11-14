import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'

import { RunSourceGroup } from '@latitude-data/constants'
import { listCompletedRuns } from '@latitude-data/core/services/runs/completed/listCompleted'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
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
      const searchParams = request.nextUrl.searchParams
      const from = searchParams.get('from')
      const limit = searchParams.get('limit')
      const sourceGroup = searchParams.get('sourceGroup') as
        | RunSourceGroup
        | undefined

      const runs = await listCompletedRuns({
        workspaceId: workspace.id,
        projectId,
        from: from ? JSON.parse(from) : undefined,
        limit: limit ? Number(limit) : undefined,
        sourceGroup,
      }).then((r) => r.unwrap())

      return NextResponse.json(runs, { status: 200 })
    },
  ),
)
