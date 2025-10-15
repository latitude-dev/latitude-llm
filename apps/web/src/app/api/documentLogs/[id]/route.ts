import { fetchDocumentLogWithMetadata } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithMetadata'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { id: string }
        workspace: Workspace
      },
    ) => {
      const id = params.id
      const result = await fetchDocumentLogWithMetadata({
        workspaceId: workspace.id,
        documentLogId: +id,
      })

      if (result.error) {
        return NextResponse.json(
          { message: `Document Log not found with uuid: ${id}` },
          { status: 404 },
        )
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
