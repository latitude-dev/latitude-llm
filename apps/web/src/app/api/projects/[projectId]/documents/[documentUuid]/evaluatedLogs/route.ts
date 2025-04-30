import { Workspace } from '@latitude-data/core/browser'
import { computeDocumentLogsQuery } from '@latitude-data/core/services/documentLogs/computeDocumentLogs'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { serializeEvaluatedDocumentLog } from '@latitude-data/core/services/evaluationsV2/llm/serializeEvaluatedDocumentLog'

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
        }
        workspace: Workspace
      },
    ) => {
      const { documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })

      if (+queryParams.pageSize > 1) {
        return NextResponse.json(
          {
            message:
              'At the moment we only support pageSize=1 for evaluated logs',
          },
          { status: 422 },
        )
      }

      if (queryParams.isEmptyResponse) {
        return NextResponse.json([], { status: 200 })
      }

      const rows = await computeDocumentLogsQuery({
        workspaceId: workspace.id,
        documentUuid,
        filterOptions: queryParams.filterOptions,
        page: queryParams.page,
        pageSize: queryParams.pageSize,
      })

      const documentLog = rows[0]

      if (!documentLog) {
        return NextResponse.json([], { status: 200 })
      }

      // NOTE: This provoke N+1 queries becuase for each log we fetch the provider logs
      // but is not a problem at the moment because we just fetch one by one on
      // custom llm evalution playground
      //
      // Please consider refactoring this if you want to fetch more than one evaluated log
      const evaluatedLogResult = await serializeEvaluatedDocumentLog({
        workspace,
        documentLog,
      })

      if (evaluatedLogResult.error) {
        return NextResponse.json(
          { message: evaluatedLogResult.error.message },
          { status: 422 },
        )
      }

      const evaluatedLog = evaluatedLogResult.value
      return NextResponse.json([evaluatedLog], { status: 200 })
    },
  ),
)
