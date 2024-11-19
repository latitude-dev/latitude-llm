import { Workspace } from '@latitude-data/core/browser'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { computeDocumentLogsDailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: string
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const days = searchParams.get('days')
        ? parseInt(searchParams.get('days')!, 10)
        : undefined

      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({ projectId: Number(projectId), uuid: commitUuid })
        .then((r) => r.unwrap())

      const result = await computeDocumentLogsDailyCount({
        documentUuid,
        draft: commit,
        days,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
