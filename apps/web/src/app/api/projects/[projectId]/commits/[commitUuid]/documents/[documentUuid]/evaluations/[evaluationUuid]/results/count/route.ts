import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/types'
import { evaluationResultsV2SearchFromQueryParams } from '@latitude-data/core/helpers'

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
      const { evaluationUuid } = params
      const search = evaluationResultsV2SearchFromQueryParams(
        Object.fromEntries(request.nextUrl.searchParams.entries()),
      )

      const repository = new EvaluationResultsV2Repository(workspace.id)
      const count = await repository
        .countListByEvaluation({ evaluationUuid, params: search })
        .then((r) => r.unwrap())

      return NextResponse.json(count, { status: 200 })
    },
  ),
)
