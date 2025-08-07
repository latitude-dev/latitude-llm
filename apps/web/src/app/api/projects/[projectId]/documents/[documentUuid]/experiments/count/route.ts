import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

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
      const scope = new ExperimentsRepository(workspace.id)
      const count = await scope.countByDocumentUuid(documentUuid)

      return NextResponse.json(count, { status: 200 })
    },
  ),
)
