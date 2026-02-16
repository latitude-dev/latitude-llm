import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { computeDocumentTracesAggregations } from '@latitude-data/core/services/tracing/spans/fetching/computeDocumentTracesAggregations'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

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

      const commitsRepo = new CommitsRepository(workspace.id)
      const headCommit = await commitsRepo.getHeadCommit(Number(projectId))
      const repo = new DocumentVersionsRepository(workspace.id)
      const document = await repo
        .getSomeDocumentByUuid({ projectId: Number(projectId), documentUuid })
        .then((r) => r.unwrap())

      const result = await computeDocumentTracesAggregations({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: headCommit?.uuid === commitUuid ? undefined : commitUuid,
      }).then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
