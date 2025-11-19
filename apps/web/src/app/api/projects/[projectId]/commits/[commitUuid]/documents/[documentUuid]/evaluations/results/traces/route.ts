import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  EvaluationResultsV2Repository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const traceIds =
        request.nextUrl.searchParams.get('traceIds')?.split(',') || []

      if (traceIds.length === 0) {
        return NextResponse.json([], { status: 200 })
      }

      const spansRepository = new SpansRepository(workspace.id)

      // Fetch spans for the specific trace IDs
      const spansPromises = traceIds.map((traceId) =>
        spansRepository.list({ traceId }).then((r) => r.unwrap()),
      )
      const spansArrays = await Promise.all(spansPromises)
      const spans = spansArrays.flat()

      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
      const results = await resultsRepository
        .listBySpans(spans)
        .then((r) => r.unwrap())

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
