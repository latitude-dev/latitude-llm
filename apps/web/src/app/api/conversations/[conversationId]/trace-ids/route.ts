import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { findTraceIdsByLogUuid } from '@latitude-data/core/queries/spans/findTraceIdsByLogUuid'
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
          conversationId: string
        }
        workspace: Workspace
      },
    ) => {
      const { conversationId } = params
      const traceIds = await findTraceIdsByLogUuid({
        workspaceId: workspace.id,
        logUuid: conversationId,
      })

      return NextResponse.json(traceIds, { status: 200 })
    },
  ),
)
