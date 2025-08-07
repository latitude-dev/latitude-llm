import type { Workspace } from '@latitude-data/core/browser'
import { PublishedDocumentRepository } from '@latitude-data/core/repositories/publishedDocumentsRepository'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params: { projectId },
        workspace,
      }: {
        params: { projectId: string }
        workspace: Workspace
      },
    ) => {
      const scope = new PublishedDocumentRepository(workspace.id)
      const rows = await scope.findByProject(Number(projectId))

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
