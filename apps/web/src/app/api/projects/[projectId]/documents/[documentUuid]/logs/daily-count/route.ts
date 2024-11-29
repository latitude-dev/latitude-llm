import { LogSources, Workspace } from '@latitude-data/core/browser'
import { computeDocumentLogsDailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
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
      const searchParams = req.nextUrl.searchParams
      const days = searchParams.get('days')
        ? parseInt(searchParams.get('days')!, 10)
        : undefined
      const { commitIds, logSources } = decodeParameters(req.nextUrl.search)
      const filterOptions = {
        commitIds: Array.isArray(commitIds) ? commitIds.map(Number) : [],
        logSources: (Array.isArray(logSources)
          ? logSources
          : []) as LogSources[],
      }

      const result = await computeDocumentLogsDailyCount({
        workspace,
        documentUuid,
        filterOptions,
        days,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
