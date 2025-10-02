import { fetchDocumentLogWithMetadata } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/types'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { uuid: string }
        workspace: Workspace
      },
    ) => {
      const uuid = params.uuid
      const result = await fetchDocumentLogWithMetadata({
        workspaceId: workspace.id,
        documentLogUuid: uuid,
      })

      if (result.error) {
        return NextResponse.json(
          { message: `Document Log not found with uuid: ${uuid}` },
          { status: 404 },
        )
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
