import { DocumentVersion, Workspace } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { projectId: number; commitUuid: string }
export const GET = errorHandler<IParam, DocumentVersion[]>(
  authHandler<IParam, DocumentVersion[]>(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          commitUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid } = params
      const commit = await new CommitsRepository(workspace.id)
        .getCommitByUuid({ uuid: commitUuid, projectId })
        .then((r) => r.unwrap())
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const result = await docsScope.getDocumentsAtCommit(commit)
      const rows = result.unwrap()

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
