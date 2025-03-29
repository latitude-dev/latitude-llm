import { Workspace } from '@latitude-data/core'
import { fetchEvaluationResultsByDocumentLogs } from '@latitude-data/core'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const documentLogIds = request.nextUrl.searchParams.get('ids')?.split(',')
      if (!documentLogIds?.length) {
        return NextResponse.json({}, { status: 200 })
      }

      const evaluationResults = await fetchEvaluationResultsByDocumentLogs({
        workspaceId: workspace.id,
        documentLogIds: documentLogIds.map(Number),
      }).then((r) => r.unwrap())

      return NextResponse.json(evaluationResults, { status: 200 })
    },
  ),
)
