import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import type { Workspace } from '@latitude-data/core/browser'
import { assembleTrace } from '@latitude-data/core/services/tracing/traces/assemble'
import { type NextRequest, NextResponse } from 'next/server'

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
