import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { getEvaluationTotalsQuery } from '@latitude-data/core/services/evaluationResults/index'
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
type EvaluationTotals = Awaited<ReturnType<typeof getEvaluationTotalsQuery>>

export const GET = errorHandler<IParam, EvaluationTotals>(
  authHandler<IParam, EvaluationTotals>(
    async (_: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { evaluationId, projectId, commitUuid, documentUuid } = params
      const evaluationScope = new EvaluationsRepository(workspace.id)
      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({
          projectId,
          uuid: commitUuid,
        })
        .then((r) => r.unwrap())
      const evaluation = await evaluationScope
        .find(evaluationId)
        .then((r) => r.unwrap())

      const result = await getEvaluationTotalsQuery({
        commit,
        evaluation,
        documentUuid,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
