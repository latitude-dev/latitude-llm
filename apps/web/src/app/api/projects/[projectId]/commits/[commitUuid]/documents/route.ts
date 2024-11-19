import { DocumentVersion } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { projectId: string; commitUuid: string }

export const GET = errorHandler<IParam, DocumentVersion[]>(
  authHandler<IParam, DocumentVersion[]>(
    async (_: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { projectId, commitUuid } = params
      const commit = await new CommitsRepository(workspace.id)
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const result = await docsScope.getDocumentsAtCommit(commit)
      const rows = result.unwrap()

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
