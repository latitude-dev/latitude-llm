import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { DocumentTriggersRepository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params: { projectId },
        workspace,
      }: {
        params: { projectId: string }
        workspace: Workspace
      },
    ) => {
      const { searchParams } = new URL(request.url)
      const documentUuid = searchParams.get('documentUuid')

      const scope = new DocumentTriggersRepository(workspace.id)

      let rows
      if (documentUuid) {
        rows = await scope.findByDocumentUuid(documentUuid)
      } else {
        rows = await scope.findByProjectId(parseInt(projectId))
      }

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
