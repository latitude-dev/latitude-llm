import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'
import { buildCommitFilter } from '$/app/api/spans/limited/route'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { computeDocumentTracesAggregations } from '@latitude-data/core/services/tracing/spans/fetching/computeDocumentTracesAggregations'

export const GET = errorHandler(
  authHandler(
    async (
      _req: NextRequest,
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
      const documentsRepo = new DocumentVersionsRepository(workspace.id)
      const commitsRepo = new CommitsRepository(workspace.id)
      const currentCommit = await commitsRepo
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.value)
      const headCommit = await commitsRepo.getHeadCommit(Number(projectId))
      const document = await documentsRepo
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())
      const commit = currentCommit ?? headCommit
      const commitUuids = commit
        ? await buildCommitFilter({
            currentCommit: commit,
            commitsRepo,
          })
        : []

      const result = await computeDocumentTracesAggregations({
        commitUuids,
        workspaceId: workspace.id,
        projectId: Number(projectId),
        documentUuid: document.documentUuid,
      }).then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
