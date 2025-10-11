import {
  fetchDocumentLogByCursor,
  fetchDocumentLogWithMetadataByCursor,
} from '@latitude-data/core/services/documentLogs/fetchDocumentLogByCursor'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/types'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: string
          documentUuid: string
          cursor: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, documentUuid, cursor } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })

      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())

      const fetchFn = queryParams.excludeErrors
        ? fetchDocumentLogByCursor
        : fetchDocumentLogWithMetadataByCursor

      const log = await fetchFn({
        document,
        cursor,
        filterOptions: queryParams.filterOptions,
      })

      if (!log) {
        return NextResponse.json({ error: 'Log not found' }, { status: 404 })
      }

      return NextResponse.json(log, { status: 200 })
    },
  ),
)
