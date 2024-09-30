import { Workspace } from '@latitude-data/core/browser'
import { DocumentLogsRepository } from '@latitude-data/core/repositories'
import { fetchDocumentLogWithMetadata } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

// TODO: DRY with api/documentLogs/[id]/route.ts
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

      if (!uuid) {
        return NextResponse.json(
          { message: `Document Log not found with uuid: ${uuid}` },
          { status: 404 },
        )
      }

      const documentLogsRepo = new DocumentLogsRepository(workspace.id)
      const _documentLog = await documentLogsRepo
        .findByUuid(uuid)
        .then((res) => res.unwrap())
      const documentLog = await fetchDocumentLogWithMetadata({
        workspaceId: workspace.id,
        documentLogId: _documentLog.id,
      }).then((res) => res.unwrap())

      return NextResponse.json(documentLog, { status: 200 })
    },
  ),
)
