import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  SpanMetadatasRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
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
          traceId: string
          spanId: string
        }
        workspace: Workspace
      },
    ) => {
      const { traceId, spanId } = params

      const spansRepository = new SpansRepository(workspace.id)
      const span = await spansRepository
        .get({ traceId, spanId })
        .then((r) => r.unwrap())

      if (!span) return notFound()

      const metadatasRepository = new SpanMetadatasRepository(workspace.id)
      const metadata = await metadatasRepository
        .get({ spanId, traceId })
        .then((r) => r.unwrap())

      return NextResponse.json({ ...span, metadata }, { status: 200 })
    },
  ),
)
