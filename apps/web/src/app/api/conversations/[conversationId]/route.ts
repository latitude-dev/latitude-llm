import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import type { Workspace } from '@latitude-data/core/browser'
import { SpansRepository } from '@latitude-data/core/repositories'
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
