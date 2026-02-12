import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  SpanMetadatasRepository,
} from '@latitude-data/core/repositories'
import { findSpan } from '@latitude-data/core/queries/spans/findSpan'
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

      const span = await findSpan({
        workspaceId: workspace.id,
        traceId,
        spanId,
      })

      if (!span) return notFound()

      const metadatasRepository = new SpanMetadatasRepository(workspace.id)
      const metadata = await metadatasRepository
        .get({ spanId, traceId })
        .then((r) => r.unwrap())

      return NextResponse.json({ ...span, metadata }, { status: 200 })
    },
  ),
)
