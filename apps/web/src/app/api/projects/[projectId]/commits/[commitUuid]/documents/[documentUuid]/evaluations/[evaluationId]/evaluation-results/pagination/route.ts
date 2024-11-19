import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { computeEvaluationResultsWithMetadataCount } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ROUTES } from '$/services/routes'
import { NextRequest, NextResponse } from 'next/server'

function pageUrl(params: {
  projectId: string
  commitUuid: string
  documentUuid: string
  evaluationId: string
}) {
  return ROUTES.projects
    .detail({ id: Number(params.projectId) })
    .commits.detail({ uuid: params.commitUuid })
    .documents.detail({ uuid: params.documentUuid })
    .evaluations.detail(Number(params.evaluationId)).root
}

type IParam = {
  evaluationId: string
  documentUuid: string
  commitUuid: string
  projectId: string
}

type IPagination = ReturnType<typeof buildPagination>
export const GET = errorHandler<IParam, IPagination>(
  authHandler<IParam, IPagination>(
    async (req: NextRequest, _res: NextResponse, { params, workspace }) => {
      const searchParams = req.nextUrl.searchParams
      const evaluationsScope = new EvaluationsRepository(workspace.id)
      const evaluation = await evaluationsScope
        .find(params.evaluationId)
        .then((r) => r.unwrap())
      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({
          uuid: params.commitUuid,
          projectId: Number(params.projectId),
        })
        .then((r) => r.unwrap())
      const countResult = await computeEvaluationResultsWithMetadataCount({
        workspaceId: workspace.id,
        evaluation,
        documentUuid: params.documentUuid,
        draft: commit,
      })

      const pagination = buildPagination({
        baseUrl: pageUrl({
          projectId: params.projectId.toString(),
          commitUuid: params.commitUuid,
          documentUuid: params.documentUuid,
          evaluationId: params.evaluationId.toString(),
        }),
        count: countResult?.[0]?.count ?? 0,
        page: searchParams.get('page')
          ? parseInt(searchParams.get('page') as string)
          : 1,
        pageSize: searchParams.get('pageSize')
          ? parseInt(searchParams.get('pageSize') as string)
          : 25,
      })

      return NextResponse.json(pagination, { status: 200 })
    },
  ),
)
