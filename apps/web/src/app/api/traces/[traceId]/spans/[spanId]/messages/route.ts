import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  AssembledSpan,
  AssembledTrace,
  SpanType,
} from '@latitude-data/core/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { assembleTraceWithMessages } from '@latitude-data/core/services/tracing/traces/assemble'
import { NextRequest, NextResponse } from 'next/server'

export type SpanMessagesResponse = {
  trace: AssembledTrace | null
  completionSpan?: AssembledSpan<SpanType.Completion>
}

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
          spanId: string
        }
        workspace: Workspace
      },
    ) => {
      const { traceId, spanId } = params

      const result = await assembleTraceWithMessages({
        traceId,
        workspace,
        spanId,
      })

      if (!result.ok || !result.value) {
        return NextResponse.json({ trace: null }, { status: 200 })
      }

      return NextResponse.json(result.unwrap(), { status: 200 })
    },
  ),
)
