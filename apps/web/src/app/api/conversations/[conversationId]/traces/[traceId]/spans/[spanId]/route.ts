import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import type { Workspace } from '@latitude-data/core/browser'
import { SpanMetadatasRepository, SpansRepository } from '@latitude-data/core/repositories'
import { notFound } from 'next/navigation'
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
          spanId: string
        }
        workspace: Workspace
      },
    ) => {
      const { traceId, spanId } = params

      const spansRepository = new SpansRepository(workspace.id)
      const span = await spansRepository.get({ traceId, spanId }).then((r) => r.unwrap())
      if (!span) return notFound()

      const metadatasRepository = new SpanMetadatasRepository(workspace.id)
      const metadata = await metadatasRepository.get({ spanId, traceId }).then((r) => r.unwrap())

      return NextResponse.json({ ...span, metadata }, { status: 200 })
    },
  ),
)
