import { Workspace } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { fetchDocumentLogsWithEvaluationResults } from '@latitude-data/core/services/documentLogs/fetchDocumentLogsWithEvaluationResults'
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
      const searchParams = new URL(req.url).searchParams
      const page = searchParams.get('page') ?? '1'
      const pageSize = searchParams.get('pageSize') ?? '25'
      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({
          projectId: Number(params.projectId),
          uuid: params.commitUuid,
        })
        .then((r) => r.unwrap())
      const evaluationsScope = new EvaluationsRepository(workspace.id)
      const evaluation = await evaluationsScope
        .find(params.evaluationId)
        .then((r) => r.unwrap())
      const rows = await fetchDocumentLogsWithEvaluationResults({
        evaluation,
        documentUuid: params.documentUuid!,
        commit,
        page,
        pageSize,
      })

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
