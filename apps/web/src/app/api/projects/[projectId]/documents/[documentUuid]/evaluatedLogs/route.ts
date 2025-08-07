import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import type { Workspace } from '@latitude-data/core/browser'
import { UnprocessableEntityError } from '@latitude-data/core/lib/errors'
import {
  DocumentVersionsRepository,
  ProviderLogsRepository,
} from '@latitude-data/core/repositories'
import { computeDocumentLogs } from '@latitude-data/core/services/documentLogs/computeDocumentLogs'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
import { serializeEvaluatedDocumentLog } from '@latitude-data/core/services/evaluationsV2/llm/serializeEvaluatedDocumentLog'
import { type NextRequest, NextResponse } from 'next/server'

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
      const { projectId, documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })
      if (+queryParams.pageSize > 1) {
        return NextResponse.json(
          {
            message: 'At the moment we only support pageSize=1 for evaluated logs',
          },
          { status: 422 },
        )
      }
      if (queryParams.isEmptyResponse) {
        return NextResponse.json([], { status: 200 })
      }

      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())
      const rows = await computeDocumentLogs({
        document,
        filterOptions: queryParams.filterOptions,
        page: queryParams.page,
        pageSize: queryParams.pageSize,
      })
      const documentLog = rows[0]
      if (!documentLog) return NextResponse.json([], { status: 200 })

      // NOTE: This provoke N+1 queries because for each log we fetch the provider logs
      // but is not a problem at the moment because we just fetch one by one on
      // custom llm evaluation playground
      //
      // Please consider refactoring this if you want to fetch more than one evaluated log
      const providerLogsScope = new ProviderLogsRepository(workspace.id)
      const providerLogs = await providerLogsScope
        .findByDocumentLogUuid(documentLog.uuid)
        .then((r) => r.unwrap())

      if (!providerLogs.length) {
        throw new UnprocessableEntityError('ProviderLogs not found for DocumentLog')
      }

      // biome-ignore lint/suspicious/noImplicitAnyLet: ignored using `--suppress`
      let configuration
      if (searchParams.has('configuration')) {
        try {
          configuration = JSON.parse(searchParams.get('configuration')!)
        } catch (_) {
          /* Nothing */
        }
      }

      const evaluatedLog = await serializeEvaluatedDocumentLog({
        documentLog,
        providerLogs,
        configuration,
      })

      return NextResponse.json([evaluatedLog], { status: 200 })
    },
  ),
)
