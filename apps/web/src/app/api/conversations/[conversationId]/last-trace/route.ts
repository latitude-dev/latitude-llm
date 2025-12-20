import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  AssembledSpan,
  AssembledTrace,
  SpanType,
} from '@latitude-data/core/constants'
import { SpansRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { assembleTraceWithMessages } from '@latitude-data/core/services/tracing/traces/assemble'
import { NextRequest, NextResponse } from 'next/server'

export type LastTraceResponse = {
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
          conversationId: string
        }
        workspace: Workspace
      },
    ) => {
      const { conversationId } = params

      const repository = new SpansRepository(workspace.id)
      const lastMainSpan =
        await repository.findLastMainSpanByDocumentLogUuid(conversationId)

      if (!lastMainSpan) {
        return NextResponse.json({ trace: null }, { status: 200 })
      }

      const result = await assembleTraceWithMessages({
        traceId: lastMainSpan.traceId,
        workspace,
      })

      if (!result.ok || !result.value) {
        return NextResponse.json({ trace: null }, { status: 200 })
      }

      return NextResponse.json(
        {
          trace: result.value.trace,
          completionSpan: result.value.completionSpan,
        },
        { status: 200 },
      )
    },
  ),
)
