import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  EvaluationResultsV2Repository,
} from '@latitude-data/core/repositories'
import { unsafelyFindSpansByDocumentLogUuids } from '@latitude-data/core/queries/spans/findByDocumentLogUuid'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const documentLogUuids =
        request.nextUrl.searchParams.get('documentLogUuids')?.split(',') || []

      const spans =
        await unsafelyFindSpansByDocumentLogUuids({ documentLogUuids })
      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
      const results = await resultsRepository.listBySpans(spans)

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
