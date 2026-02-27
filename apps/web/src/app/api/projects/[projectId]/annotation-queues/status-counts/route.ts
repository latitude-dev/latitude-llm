import { findAllAnnotationQueuesByProjectId } from '@latitude-data/core/queries/annotationQueues/findAllByProjectId'
import { countAnnotationQueueItemsByStatus } from '@latitude-data/core/queries/clickhouse/annotationQueueItems/findItems'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { projectId: string }
        workspace: Workspace
      },
    ) => {
      const queues = await findAllAnnotationQueuesByProjectId({
        workspaceId: workspace.id,
        projectId: Number(params.projectId),
      })

      const queueIds = queues.map((q) => q.id)
      const counts = await countAnnotationQueueItemsByStatus({
        workspaceId: workspace.id,
        annotationQueueIds: queueIds,
      })

      return NextResponse.json(counts, { status: 200 })
    },
  ),
)
