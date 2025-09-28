import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ROUTES } from '$/services/routes'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/types'
import {
  evaluationResultsV2SearchFromQueryParams,
  evaluationResultsV2SearchToQueryParams,
} from '@latitude-data/core/helpers'

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
      const count = await repository
        .countListByEvaluation({ evaluationUuid, params: search })
        .then((r) => r.unwrap())

      const baseUrl = ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
        .evaluations.detail({ uuid: evaluationUuid }).root
      const queryParams = evaluationResultsV2SearchToQueryParams(search)

      const pagination = buildPagination({
        baseUrl: baseUrl,
        queryParams: queryParams,
        encodeQueryParams: true,
        count: count,
        page: search.pagination.page,
        pageSize: search.pagination.pageSize,
      })

      return NextResponse.json(pagination, { status: 200 })
    },
  ),
)
