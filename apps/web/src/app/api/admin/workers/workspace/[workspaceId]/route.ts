import { getWorkspaceQueueUsage } from '@latitude-data/core/services/workers/inspect'
import { removeWorkspaceJobs } from '@latitude-data/core/services/workers/manage'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(
    async (_: NextRequest, { params }: { params: { workspaceId: string } }) => {
      const workspaceId = parseInt(params.workspaceId)
      if (isNaN(workspaceId)) {
        return NextResponse.json(
          { message: 'Invalid workspaceId' },
          { status: 400 },
        )
      }

      const result = await getWorkspaceQueueUsage({ workspaceId })
      return NextResponse.json(result.unwrap(), { status: 200 })
    },
  ),
)

export const DELETE = errorHandler(
  adminHandler(
    async (
      req: NextRequest,
      { params }: { params: { workspaceId: string } },
    ) => {
      const workspaceId = parseInt(params.workspaceId)
      if (isNaN(workspaceId)) {
        return NextResponse.json(
          { message: 'Invalid workspaceId' },
          { status: 400 },
        )
      }

      const body = await req.json().catch(() => ({}))
      const { queueName } = body as { queueName?: string }

      const result = await removeWorkspaceJobs({ workspaceId, queueName })
      return NextResponse.json(result.unwrap(), { status: 200 })
    },
  ),
)
