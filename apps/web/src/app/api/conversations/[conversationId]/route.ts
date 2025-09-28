import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { SpansRepository } from '@latitude-data/core/repositories'
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
        }
        workspace: Workspace
      },
    ) => {
      const { conversationId } = params

      const repository = new SpansRepository(workspace.id)
      const traces = await repository.listTracesByLog(conversationId)

      return NextResponse.json(traces, { status: 200 })
    },
  ),
)
