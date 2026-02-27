import { findAllAnnotationQueuesByProjectId } from '@latitude-data/core/queries/annotationQueues/findAllByProjectId'
import { findMembersByQueueIds } from '@latitude-data/core/queries/annotationQueues/findMembersByQueueIds'
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
      const members = await findMembersByQueueIds({
        workspaceId: workspace.id,
        queueIds,
      })

      return NextResponse.json(members, { status: 200 })
    },
  ),
)
