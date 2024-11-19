import { CommitsRepository } from '@latitude-data/core/repositories'
import { computeDocumentLogsDailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { projectId: string; commitUuid: string; documentUuid: string }
type ResponseResult = Awaited<ReturnType<typeof computeDocumentLogsDailyCount>>

export const GET = errorHandler<IParam, ResponseResult>(
  authHandler<IParam, ResponseResult>(
    async (req: NextRequest, _res: NextResponse, { params, workspace }) => {
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
