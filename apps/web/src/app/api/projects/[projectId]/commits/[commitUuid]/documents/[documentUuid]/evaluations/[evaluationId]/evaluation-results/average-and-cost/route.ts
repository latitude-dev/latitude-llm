import { ExtractOk } from '@latitude-data/core/lib/Result'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { computeAverageResultAndCostOverCommit } from '@latitude-data/core/services/evaluationResults/index'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = {
  evaluationId: number
  documentUuid: string
  commitUuid: string
  projectId: number
  page: string | null
  pageSize: string | null
}
type ResponseResult = Awaited<
  ReturnType<typeof computeAverageResultAndCostOverCommit>
>
type AverageResultAndCost = ExtractOk<ResponseResult>

export const GET = errorHandler<IParam, AverageResultAndCost>(
  authHandler<IParam, AverageResultAndCost>(
    async (_: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { evaluationId, documentUuid } = params
      const evaluationScope = new EvaluationsRepository(workspace.id)
      const evaluation = await evaluationScope
        .find(evaluationId)
        .then((r) => r.unwrap())
      const result = await computeAverageResultAndCostOverCommit({
        workspaceId: workspace.id,
        evaluation,
        documentUuid,
      }).then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
