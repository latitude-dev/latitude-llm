import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { OkType } from '@latitude-data/core/lib/Result'
import { SpansRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { assembleTrace } from '@latitude-data/core/services/tracing/traces/assemble'
import { NextRequest, NextResponse } from 'next/server'

export type AssembledTraceResponse = OkType<typeof assembleTrace>

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
      const traceId = await repository.getLastTraceByLogUuid(conversationId)
      if (!traceId) {
        return NextResponse.json({ error: 'No trace found' }, { status: 404 })
      }
      const trace = await assembleTrace({ traceId, workspace }).then((r) =>
        r.unwrap(),
      )

      return NextResponse.json(trace, { status: 200 })
    },
  ),
)
