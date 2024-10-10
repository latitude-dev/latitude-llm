import { Workspace } from '@latitude-data/core/browser'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const search = req.nextUrl.searchParams
      const documentUuid = search.get('documentUuid')
      const scope = new EvaluationsRepository(workspace.id)
      let result
      if (documentUuid) {
        result = await scope.findByDocumentUuid(documentUuid)
      } else {
        result = await scope.findAll()
      }

      const evaluations = result.unwrap()

      return NextResponse.json(evaluations, { status: 200 })
    },
  ),
)
