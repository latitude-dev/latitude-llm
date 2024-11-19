import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { computeEvaluationResultsWithMetadata } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = {
  evaluationId: string
  documentUuid: string
  commitUuid: string
  projectId: string
}
type IResult = Awaited<ReturnType<typeof computeEvaluationResultsWithMetadata>>
export const GET = errorHandler<IParam, IResult>(
  authHandler<IParam, IResult>(
    async (req: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { documentUuid, commitUuid, evaluationId, projectId } = params

      const searchParams = req.nextUrl.searchParams
      const page = searchParams.get('page')
      const pageSize = searchParams.get('pageSize')
      const commitsScope = new CommitsRepository(workspace.id)
      const evaluationScope = new EvaluationsRepository(workspace.id)
      const evaluation = await evaluationScope
        .find(Number(evaluationId))
        .then((r) => r.unwrap())
      const commit = await commitsScope
        .getCommitByUuid({ projectId: Number(projectId), uuid: commitUuid })
        .then((r) => r.unwrap())

      const rows = await computeEvaluationResultsWithMetadata({
        workspaceId: evaluation.workspaceId,
        evaluation,
        documentUuid,
        draft: commit,
        page: page ?? undefined,
        pageSize: pageSize ?? undefined,
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
