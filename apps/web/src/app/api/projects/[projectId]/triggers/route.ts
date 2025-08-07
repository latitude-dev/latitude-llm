import type { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'
import { DocumentTriggersRepository } from '@latitude-data/core/repositories'

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

      // biome-ignore lint/suspicious/noImplicitAnyLet: ignored using `--suppress`
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
