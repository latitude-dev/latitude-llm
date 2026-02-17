import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  SpanMetadatasRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NotFoundError } from '@latitude-data/constants/errors'

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

      const spansRepository = new SpansRepository(workspace.id)
      const span = await spansRepository
        .getByDocumentLogUuidAndSpanId({ documentLogUuid, spanId })
        .then((r) => r.unwrap())

      if (!span) throw new NotFoundError(`Span with id ${spanId} not found`)

      const metadatasRepository = new SpanMetadatasRepository(workspace.id)
      const metadata = await metadatasRepository
        .get({ spanId, traceId: span.traceId })
        .then((r) => r.unwrap())

      return NextResponse.json({ ...span, metadata }, { status: 200 })
    },
  ),
)
