import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { listActiveRunsByDocument } from '@latitude-data/core/services/runs/active/byDocument/listByDocument'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/projects/:projectId/commits/:commitUuid/documents/:documentUuid/runs/active
 *
 * Lists active runs for a specific document.
 * This uses the new document-scoped storage for better performance.
 */
export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, documentUuid } = params
      const searchParams = request.nextUrl.searchParams
      const page = searchParams.get('page')
      const pageSize = searchParams.get('pageSize')

      const runs = await listActiveRunsByDocument({
        workspaceId: workspace.id,
        projectId,
        documentUuid,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }).then((r) => r.unwrap())

      return NextResponse.json(runs, { status: 200 })
    },
  ),
)
