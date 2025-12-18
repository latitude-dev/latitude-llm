import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { AssembledTrace } from '@latitude-data/core/constants'
import { SpansRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { assembleTraceStructure } from '@latitude-data/core/services/tracing/traces/assemble'
import { NextRequest, NextResponse } from 'next/server'

export type ConversationTracesResponse = {
  traces: AssembledTrace[]
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
      const traceIds = await repository.listTraceIdsByLogUuid(conversationId)

      if (traceIds.length === 0) {
        return NextResponse.json({ traces: [] }, { status: 200 })
      }

      const traces: AssembledTrace[] = []
      for (const traceId of traceIds) {
        const result = await assembleTraceStructure({ traceId, workspace })
        if (result.ok && result.value) {
          traces.push(result.value.trace)
        }
      }

      // Sort by startedAt
      traces.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

      return NextResponse.json({ traces }, { status: 200 })
    },
  ),
)
