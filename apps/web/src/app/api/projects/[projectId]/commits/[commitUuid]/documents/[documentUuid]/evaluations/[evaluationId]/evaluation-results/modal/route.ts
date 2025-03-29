import { Workspace } from '@latitude-data/core'
import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core'
import { getEvaluationModalValueQuery } from '@latitude-data/core'
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
      const result = await getEvaluationModalValueQuery({
        workspaceId: workspace.id,
        commit,
        evaluation,
        documentUuid,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
