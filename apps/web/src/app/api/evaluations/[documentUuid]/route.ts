import { Workspace } from '@latitude-data/core/browser'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
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

      const evaluationsScope = new EvaluationsRepository(workspace.id)
      const evaluations = await evaluationsScope
        .findByDocumentUuid(documentUuid)
        .then((r) => r.unwrap())

      return NextResponse.json(evaluations, { status: 200 })
    },
  ),
)
