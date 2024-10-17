import { Workspace } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { computeEvaluationResultsByDocumentContent } from '@latitude-data/core/services/evaluationResults/index'
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
        .find(evaluationId)
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
