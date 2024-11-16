import { Workspace } from '@latitude-data/core/browser'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { computeAverageResultOverTime } from '@latitude-data/core/services/evaluationResults/index'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

// FIXME: Use generic types. Check other routes for examples.
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
      const evaluation = await evaluationScope
        .find(evaluationId)
        .then((r) => r.unwrap())
      const result = await computeAverageResultOverTime({
        workspaceId: workspace.id,
        evaluation,
        documentUuid,
      }).then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
