import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  type Workspace,
  evaluationResultsV2SearchFromQueryParams,
} from '@latitude-data/core/browser'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { type NextRequest, NextResponse } from 'next/server'

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
          evaluationUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, documentUuid, evaluationUuid } = params
      const search = evaluationResultsV2SearchFromQueryParams(
        Object.fromEntries(request.nextUrl.searchParams.entries()),
      )

      const repository = new EvaluationResultsV2Repository(workspace.id)
      const stats = await repository
        .statsByEvaluation({
          projectId: projectId,
          commitUuid: commitUuid,
          documentUuid: documentUuid,
          evaluationUuid: evaluationUuid,
          params: search,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(stats ?? {}, { status: 200 })
    },
  ),
)
