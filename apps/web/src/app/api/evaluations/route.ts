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
      const documentUuid = req.nextUrl.searchParams.get('documentUuid')
      const evaluationsScope = new EvaluationsRepository(workspace.id)
      const result = documentUuid
        ? await evaluationsScope.findByDocumentUuid(documentUuid)
        : await evaluationsScope.findAll()

      return NextResponse.json(result.unwrap(), { status: 200 })
    },
  ),
)
