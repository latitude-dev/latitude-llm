import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

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
      const traceId = request.nextUrl.searchParams.get('traceId')

      if (!spanId || !traceId) {
        return NextResponse.json(
          { error: 'spanId and traceId are required' },
          { status: 400 },
        )
      }

      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)

      const results = await resultsRepository
        .listBySpanTrace({
          projectId: projectId,
          documentUuid: documentUuid,
          spanId: spanId,
          traceId: traceId,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
