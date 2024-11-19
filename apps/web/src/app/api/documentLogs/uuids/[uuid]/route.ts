import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { fetchDocumentLogWithMetadata } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { uuid: string }
export const GET = errorHandler<IParam, DocumentLogWithMetadataAndError>(
  authHandler<IParam, DocumentLogWithMetadataAndError>(
    async (_: NextRequest, _res: NextResponse, { params, workspace }) => {
      const uuid = params.uuid
      const log = await fetchDocumentLogWithMetadata({
        workspaceId: workspace.id,
        documentLogUuid: uuid,
      }).then((r) => r.unwrap())

      return NextResponse.json(log, { status: 200 })
    },
  ),
)
