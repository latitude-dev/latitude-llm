import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { ExperimentsRepository } from '@latitude-data/core/repositories'

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
