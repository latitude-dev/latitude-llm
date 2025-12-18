import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { OkType } from '@latitude-data/core/lib/Result'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export type ResultSpanResponse = Awaited<
  OkType<EvaluationResultsV2Repository['listBySpanAndDocumentLogUuid']>
>
export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, documentUuid } = params
      const spanId = request.nextUrl.searchParams.get('spanId')
      const documentLogUuid =
        request.nextUrl.searchParams.get('documentLogUuid')

      if (!spanId || !documentLogUuid) {
        return NextResponse.json(
          { error: 'spanId and documentLogUuid are required' },
          { status: 400 },
        )
      }

      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)

      const results = await resultsRepository
        .listBySpanAndDocumentLogUuid({
          projectId: projectId,
          documentUuid: documentUuid,
          spanId: spanId,
          documentLogUuid: documentLogUuid,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
