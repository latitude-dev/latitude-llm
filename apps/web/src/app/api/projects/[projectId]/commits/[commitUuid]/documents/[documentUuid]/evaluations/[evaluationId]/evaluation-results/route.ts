import { Workspace } from '@latitude-data/core/browser'
import { paginateQuery } from '@latitude-data/core/lib/index'
import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { computeEvaluationResultsWithMetadataQuery } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          evaluationId: number
          documentUuid: string
          commitUuid: string
          projectId: number
        }
        workspace: Workspace
      },
    ) => {
      const { documentUuid, commitUuid, evaluationId, projectId } = params

      const searchParams = req.nextUrl.searchParams
      const page = searchParams.get('page')
      const pageSize = searchParams.get('pageSize')
      const commitsScope = new CommitsRepository(workspace.id)
      const evaluationScope = new EvaluationsRepository(workspace.id)
      const evaluation = await evaluationScope
        .find(evaluationId)
        .then((r) => r.unwrap())
      const commit = await commitsScope
        .getCommitByUuid({ projectId, uuid: commitUuid })
        .then((r) => r.unwrap())
      const query = computeEvaluationResultsWithMetadataQuery({
        workspaceId: evaluation.workspaceId,
        evaluation,
        documentUuid,
        draft: commit,
      })

      const { rows } = await paginateQuery({
        searchParams: {
          page: page ?? undefined,
          pageSize: pageSize ?? undefined,
        },
        dynamicQuery: query.$dynamic(),
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
