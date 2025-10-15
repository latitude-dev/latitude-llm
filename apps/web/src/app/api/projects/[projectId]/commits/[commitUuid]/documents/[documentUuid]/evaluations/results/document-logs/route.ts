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
      const documentLogUuids =
        request.nextUrl.searchParams.get('documentLogUuids')?.split(',') || []

      const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
      const results = await resultsRepository
        .listByDocumentLogs({
          projectId: projectId,
          documentUuid: documentUuid,
          documentLogUuids: documentLogUuids,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
