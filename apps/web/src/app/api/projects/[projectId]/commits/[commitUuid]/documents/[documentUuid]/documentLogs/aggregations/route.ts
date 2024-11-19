import { CommitsRepository } from '@latitude-data/core/repositories'
import { computeDocumentLogsAggregations } from '@latitude-data/core/services/documentLogs/computeDocumentLogsAggregations'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = {
  projectId: string
  commitUuid: string
  documentUuid: string
}
type ResponseResult = Awaited<
  ReturnType<typeof computeDocumentLogsAggregations>
>
export const GET = errorHandler<IParam, ResponseResult>(
  authHandler<IParam, ResponseResult>(
    async (_: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { projectId, commitUuid, documentUuid } = params
      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({ projectId: Number(projectId), uuid: commitUuid })
        .then((r) => r.unwrap())

      const result = await computeDocumentLogsAggregations({
        documentUuid,
        draft: commit,
      })

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
