import { Workspace } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { getEvaluationMeanValueQuery } from '@latitude-data/core/services/evaluationResults/index'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          evaluationId: number
          documentUuid: string
          commitUuid: string
          projectId: number
          page: string | null
          pageSize: string | null
        }
        workspace: Workspace
      },
    ) => {
      const { evaluationId, documentUuid } = params
      const evaluationScope = new EvaluationsRepository(workspace.id)
      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({
          projectId: Number(params.projectId),
          uuid: params.commitUuid,
        })
        .then((r) => r.unwrap())
      const evaluation = await evaluationScope
        .find(evaluationId)
        .then((r) => r.unwrap())

      const result = await getEvaluationMeanValueQuery({
        workspaceId: workspace.id,
        commit,
        evaluation,
        documentUuid,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
