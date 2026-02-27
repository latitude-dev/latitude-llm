import { findAnnotationQueueItems } from '@latitude-data/core/queries/clickhouse/annotationQueueItems/findItems'
import { AnnotationQueueItemStatus } from '@latitude-data/constants/annotationQueues'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { projectId: string; queueId: string }
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const status = searchParams.get('status') as
        | AnnotationQueueItemStatus
        | undefined
      const limit = Number(searchParams.get('limit') ?? 20)
      const fromCreatedAt = searchParams.get('fromCreatedAt')
      const fromTraceId = searchParams.get('fromTraceId')

      const from =
        fromCreatedAt && fromTraceId
          ? { createdAt: fromCreatedAt, traceId: fromTraceId }
          : undefined

      const result = await findAnnotationQueueItems({
        workspaceId: workspace.id,
        annotationQueueId: Number(params.queueId),
        status: status || undefined,
        from,
        limit,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
