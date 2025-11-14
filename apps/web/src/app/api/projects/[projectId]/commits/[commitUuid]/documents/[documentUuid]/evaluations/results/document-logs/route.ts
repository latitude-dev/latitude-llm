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
      const documentLogUuids =
        request.nextUrl.searchParams.get('documentLogUuids')?.split(',') || []

      const spansRepository = new SpansRepository(workspace.id)
      const spans =
        await spansRepository.findByDocumentLogUuids(documentLogUuids)
      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
      const results = await resultsRepository.listBySpans(spans)

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
