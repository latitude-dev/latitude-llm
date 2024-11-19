import {
  ConnectedDocumentWithMetadata,
  ConnectedEvaluationsRepository,
} from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { evaluationId: string }

export const GET = errorHandler<IParam, ConnectedDocumentWithMetadata[]>(
  authHandler<IParam, ConnectedDocumentWithMetadata[]>(
    async (_req: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { evaluationId } = params
      const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
        workspace.id,
      )
      const result =
        await connectedEvaluationsScope.getConnectedDocumentsWithMetadata(
          Number(evaluationId),
        )
      const data = result.unwrap()
      return NextResponse.json(data, { status: 200 })
    },
  ),
)
