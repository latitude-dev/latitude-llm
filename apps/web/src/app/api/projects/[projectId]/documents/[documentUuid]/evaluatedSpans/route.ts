import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  SpansRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { parseApiDocumentLogParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/parseApiLogFilterParams'
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
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const queryParams = parseApiDocumentLogParams({ searchParams })
      if (+queryParams.pageSize > 1) {
        return NextResponse.json(
          {
            message:
              'At the moment we only support pageSize=1 for evaluated logs',
          },
          { status: 422 },
        )
      }
      if (queryParams.isEmptyResponse) return NextResponse.json([])

      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo.getHeadCommit(Number(projectId))
      if (!commit) return NextResponse.json([])

      const repo = new SpansRepository(workspace.id)
      const spanPagination = await repo
        .findByDocumentAndCommitLimited({
          documentUuid,
          commitUuids: [commit.uuid],
          limit: 1,
        })
        .then((r) => r.value)
      if (!spanPagination) return NextResponse.json([])
      const span = spanPagination.items[0]
      if (!span) return NextResponse.json([])

      return NextResponse.json([span], { status: 200 })
    },
  ),
)
