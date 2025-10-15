import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

import { evaluationResultsV2SearchFromQueryParams } from '@latitude-data/core/helpers'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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
      const results = await repository
        .listByEvaluation({ evaluationUuid, params: search })
        .then((r) => r.unwrap())

      return NextResponse.json(results, { status: 200 })
    },
  ),
)
