import { BadRequestError } from '@latitude-data/core/lib/errors'
import { previewDatasetFromSpans } from '@latitude-data/core/services/datasets/previewFromSpans'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { findSpanIdentifiersByDocumentLogUuids } from '@latitude-data/core/queries/spans/findByDocumentLogUuid'

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
      const documentLogUuidsParam = query.get('documentLogUuids')

      if (!documentLogUuidsParam) {
        return NextResponse.json(
          {
            columns: [],
            existingRows: [],
            newRows: [],
          },
          { status: 200 },
        )
      }

      const documentLogUuids = JSON.parse(documentLogUuidsParam) as string[]
      if (documentLogUuids.length === 0) {
        return NextResponse.json(
          {
            columns: [],
            existingRows: [],
            newRows: [],
          },
          { status: 200 },
        )
      }

      const spanIdentifiers =
        await findSpanIdentifiersByDocumentLogUuids({
          workspaceId: workspace.id,
          documentLogUuids,
        })

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
