import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { fetchDocumentLogWithMetadata } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type Params = { id: string }
export const GET = errorHandler<Params, DocumentLogWithMetadataAndError>(
  authHandler<Params, DocumentLogWithMetadataAndError>(
    async (_: NextRequest, { params, workspace }) => {
      const id = params.id
      const log = await fetchDocumentLogWithMetadata({
        workspaceId: workspace.id,
        documentLogId: +id,
      }).then((res) => res.unwrap())

      return NextResponse.json(log, { status: 200 })
    },
  ),
)
