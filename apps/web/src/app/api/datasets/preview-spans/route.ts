import { BadRequestError } from '@latitude-data/core/lib/errors'
import { previewDatasetFromSpans } from '@latitude-data/core/services/datasets/previewFromSpans'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const query = request.nextUrl.searchParams
      const spanIdentifiersParam = query.get('spanIdentifiers') ?? '[]'
      const spanIdentifiers = JSON.parse(spanIdentifiersParam) as Array<{
        traceId: string
        spanId: string
      }>
      if (spanIdentifiers.length === 0) {
        return NextResponse.json(
          {
            columns: [],
            existingRows: [],
            newRows: [],
          },
          { status: 200 },
        )
      }

      const result = await previewDatasetFromSpans({
        workspace,
        data: {
          name: query.get('name') ?? '',
          spanIdentifiers,
        },
      })

      if (result.error) {
        throw new BadRequestError(result.error.message)
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
