import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { DocumentTriggersRepository } from '@latitude-data/core/repositories'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params: { documentUuid },
        workspace,
      }: {
        params: { documentUuid: string }
        workspace: Workspace
      },
    ) => {
      const scope = new DocumentTriggersRepository(workspace.id)
      const rows = await scope.findByDocumentUuid(documentUuid)

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
