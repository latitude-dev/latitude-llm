import { LogSources, Workspace } from '@latitude-data/core/browser'
import { computeDocumentLogsAggregations } from '@latitude-data/core/services/documentLogs/computeDocumentLogsAggregations'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { decodeParameters } from '$/services/helpers'

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
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { documentUuid } = params
      const { commitIds, logSources } = decodeParameters(req.nextUrl.search)
      const filterOptions = {
        commitIds: Array.isArray(commitIds) ? commitIds.map(Number) : [],
        logSources: (Array.isArray(logSources)
          ? logSources
          : []) as LogSources[],
      }

      const result = await computeDocumentLogsAggregations({
        workspace,
        documentUuid,
        filterOptions,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
