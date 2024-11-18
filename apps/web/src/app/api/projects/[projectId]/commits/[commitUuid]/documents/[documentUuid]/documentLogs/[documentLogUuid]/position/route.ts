import { Workspace } from '@latitude-data/core/browser'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { fetchDocumentLogWithPosition } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithPosition'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params: { projectId, commitUuid, documentLogUuid },
        workspace,
      }: {
        params: {
          projectId: string
          commitUuid: string
          documentUuid: string
          documentLogUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const commitsScope = new CommitsRepository(workspace.id)
      const searchParams = req.nextUrl.searchParams
      const excludeErrors = searchParams.get('excludeErrors') === 'true'
      const commit = await commitsScope
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())
      const result = await fetchDocumentLogWithPosition({
        workspace,
        commit,
        documentLogUuid,
        excludeErrors,
      })

      if (result.error) {
        return NextResponse.json(
          { message: `Document Log not found with uuid: ${documentLogUuid}` },
          { status: 404 },
        )
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
