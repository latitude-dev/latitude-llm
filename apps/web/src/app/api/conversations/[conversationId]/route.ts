import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { SegmentsRepository } from '@latitude-data/core/repositories'
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

      const repository = new SegmentsRepository(workspace.id)
      const traces = await repository
        .listTracesByLog({ logUuid: conversationId })
        .then((r) => r.unwrap())

      return NextResponse.json(traces, { status: 200 })
    },
  ),
)
