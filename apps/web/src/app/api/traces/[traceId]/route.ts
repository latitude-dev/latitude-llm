import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { assembleTraceStructure } from '@latitude-data/core/services/tracing/traces/assemble'
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
          traceId: string
        }
        workspace: Workspace
      },
    ) => {
      const { traceId } = params
      const { trace } = await assembleTraceStructure({
        traceId: traceId,
        workspace: workspace,
      }).then((r) => r.unwrap())

      return NextResponse.json(trace, { status: 200 })
    },
  ),
)
