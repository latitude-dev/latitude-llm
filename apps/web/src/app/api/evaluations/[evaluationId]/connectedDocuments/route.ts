import { Workspace } from '@latitude-data/core/browser'
import { ConnectedEvaluationsRepository } from '@latitude-data/core/repositories'
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
        }
        workspace: Workspace
      },
    ) => {
      const { evaluationId } = params
      const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
        workspace.id,
      )
      const connectedDocuments =
        await connectedEvaluationsScope.getConnectedDocumentsWithMetadata(
          evaluationId,
        )

      return NextResponse.json(connectedDocuments.unwrap(), { status: 200 })
    },
  ),
)
