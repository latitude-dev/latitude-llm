import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { assembleTrace } from '@latitude-data/core/services/tracing/traces/assemble'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/types'

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
          traceId: string
        }
        workspace: Workspace
      },
    ) => {
      const { conversationId, traceId } = params

      const { trace } = await assembleTrace({
        conversationId: conversationId,
        traceId: traceId,
        workspace: workspace,
      }).then((r) => r.unwrap())

      return NextResponse.json(trace, { status: 200 })
    },
  ),
)
