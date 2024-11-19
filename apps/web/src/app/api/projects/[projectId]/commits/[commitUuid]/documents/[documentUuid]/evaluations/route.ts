import { ConnectedEvaluation } from '@latitude-data/core/browser'
import { ConnectedEvaluationsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { documentUuid: string }
export const GET = errorHandler<IParam, ConnectedEvaluation[]>(
  authHandler<IParam, ConnectedEvaluation[]>(
    async (_: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { documentUuid } = params
      const scope = new ConnectedEvaluationsRepository(workspace.id)
      const connectedEvaluations = await scope
        .filterByDocumentUuid(documentUuid)
        .then((r) => r.unwrap())

      return NextResponse.json(connectedEvaluations, { status: 200 })
    },
  ),
)
