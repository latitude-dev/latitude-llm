import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  SpanMetadatasRepository,
} from '@latitude-data/core/repositories'
import { findSpanByDocumentLogUuidAndSpanId } from '@latitude-data/core/queries/spans/findSpanByDocumentLogUuidAndSpanId'
import { notFound } from 'next/navigation'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

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
          spanId: string
        }
        workspace: Workspace
      },
    ) => {
      const { conversationId: documentLogUuid, spanId } = params

      const span = await findSpanByDocumentLogUuidAndSpanId({
        workspaceId: workspace.id,
        documentLogUuid,
        spanId,
      })
      if (!span) return notFound()

      const metadatasRepository = new SpanMetadatasRepository(workspace.id)
      const metadata = await metadatasRepository
        .get({ spanId, traceId: span.traceId })
        .then((r) => r.unwrap())

      return NextResponse.json({ ...span, metadata }, { status: 200 })
    },
  ),
)
