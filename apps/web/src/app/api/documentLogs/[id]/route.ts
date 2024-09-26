import { Workspace } from '@latitude-data/core/browser'
import { database } from '@latitude-data/core/client'
import { fetchDocumentLogWithMetadata } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithMetadata'
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
        params: { id: number }
        workspace: Workspace
      },
    ) => {
      const id = params.id

      if (!id) {
        return NextResponse.json(
          { message: `Document Log not found with ID: ${id}` },
          { status: 404 },
        )
      }

      const documentLog = await fetchDocumentLogWithMetadata(
        {
          workspaceId: workspace.id,
          documentLogId: id,
        },
        database,
      ).then((res) => res.unwrap())

      return NextResponse.json(documentLog, { status: 200 })
    },
  ),
)
