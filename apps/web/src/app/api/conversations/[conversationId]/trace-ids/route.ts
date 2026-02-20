import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { SpansRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
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
      const commitUuid =
        request.nextUrl.searchParams.get('commitUuid') ?? undefined
      const documentUuid =
        request.nextUrl.searchParams.get('documentUuid') ?? undefined
      const repository = new SpansRepository(workspace.id)
      const traceIds = await repository.listTraceIdsByLogUuid(conversationId, {
        commitUuid,
        documentUuid,
      })

      return NextResponse.json(traceIds, { status: 200 })
    },
  ),
)
