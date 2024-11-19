import { ExtractOk } from '@latitude-data/core/lib/Result'
import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { computeEvaluationResultsByDocumentContent } from '@latitude-data/core/services/evaluationResults/index'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = {
  evaluationId: string
  documentUuid: string
  commitUuid: string
  projectId: number
}

type ResponseResult = Awaited<
  ReturnType<typeof computeEvaluationResultsByDocumentContent>
>
type EvalsByDocumentContent = ExtractOk<ResponseResult>

export const GET = errorHandler<IParam, EvalsByDocumentContent>(
  authHandler<IParam, EvalsByDocumentContent>(
    async (req: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { evaluationId, documentUuid, commitUuid, projectId } = params
      const { searchParams } = new URL(req.url)
      const page = Number(searchParams.get('page')) || 1
      const pageSize = Number(searchParams.get('pageSize')) || 10

      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({ projectId, uuid: commitUuid })
        .then((r) => r.unwrap())

      const evaluationsScope = new EvaluationsRepository(workspace.id)
      const evaluation = await evaluationsScope
        .find(Number(evaluationId))
        .then((r) => r.unwrap())

      const result = await computeEvaluationResultsByDocumentContent({
        evaluation,
        commit,
        documentUuid,
        page,
        pageSize,
      })
      const data = result.unwrap()

      return NextResponse.json(data, { status: 200 })
    },
  ),
)
