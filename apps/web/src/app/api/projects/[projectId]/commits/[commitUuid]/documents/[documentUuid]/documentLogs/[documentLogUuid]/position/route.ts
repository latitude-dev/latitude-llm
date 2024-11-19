import { Ok } from '@latitude-data/core/lib/Result'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { fetchDocumentLogWithPosition } from '@latitude-data/core/services/documentLogs/fetchDocumentLogWithPosition'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { projectId: string; commitUuid: string; documentLogUuid: string }

type ResponseResult = Awaited<ReturnType<typeof fetchDocumentLogWithPosition>>
type Position = ResponseResult extends Ok<infer T> ? T : never

export const GET = errorHandler<IParam, Position>(
  authHandler<IParam, Position>(
    async (req: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { projectId, commitUuid, documentLogUuid } = params
      const commitsScope = new CommitsRepository(workspace.id)
      const searchParams = req.nextUrl.searchParams
      const excludeErrors = searchParams.get('excludeErrors') === 'true'
      const commit = await commitsScope
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())
      const position = await fetchDocumentLogWithPosition({
        workspace,
        commit,
        documentLogUuid,
        excludeErrors,
      }).then((r) => r.unwrap())

      return NextResponse.json(position, { status: 200 })
    },
  ),
)
