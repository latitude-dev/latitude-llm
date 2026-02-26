import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { buildCommitFilter } from '$/app/api/spans/limited/route'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { computeDocumentTracesDailyCount } from '@latitude-data/core/services/tracing/spans/fetching/computeDocumentTracesDailyCount'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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
        ? Number(searchParams.get('days'))
        : undefined

      const commitsRepo = new CommitsRepository(workspace.id)
      const currentCommit = await commitsRepo
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())
      const commitUuids = await buildCommitFilter({
        currentCommit,
        commitsRepo,
      })

      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())

      const result = await computeDocumentTracesDailyCount({
        workspaceId: workspace.id,
        projectId: Number(projectId),
        documentUuid: document.documentUuid,
        commitUuids,
        days,
      }).then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
