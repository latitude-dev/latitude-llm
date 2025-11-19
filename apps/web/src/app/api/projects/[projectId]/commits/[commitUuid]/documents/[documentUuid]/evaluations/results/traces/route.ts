import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const traceIds =
        request.nextUrl.searchParams.get('traceIds')?.split(',') || []

      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
      const results = await resultsRepository
        .listByTraceIds(traceIds)
        .then((r) => r.unwrap())

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
