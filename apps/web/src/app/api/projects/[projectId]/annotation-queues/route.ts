import { findAnnotationQueuesByProjectId } from '@latitude-data/core/queries/annotationQueues/findByProjectId'
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
        params: { projectId: string }
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const limit = Number(searchParams.get('limit') ?? 20)
      const fromCreatedAt = searchParams.get('fromCreatedAt')
      const fromId = searchParams.get('fromId')

      const from =
        fromCreatedAt && fromId
          ? { createdAt: fromCreatedAt, id: Number(fromId) }
          : undefined

      const result = await findAnnotationQueuesByProjectId({
        workspaceId: workspace.id,
        projectId: Number(params.projectId),
        from,
        limit,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
