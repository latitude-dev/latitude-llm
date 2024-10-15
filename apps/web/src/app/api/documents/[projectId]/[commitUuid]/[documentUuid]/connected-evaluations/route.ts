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
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { documentUuid } = params
      const scope = new ConnectedEvaluationsRepository(workspace.id)
      const connectedEvaluations = await scope
        .filterByDocumentUuid(documentUuid)
        .then((r) => r.unwrap())

      return NextResponse.json(connectedEvaluations, { status: 200 })
    },
  ),
)
