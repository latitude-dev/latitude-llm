'use server'

import type { Workspace } from '@latitude-data/core/browser'
import { CommitsRepository, DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { projectId: string; commitUuid: string }
        workspace: Workspace
      },
    ) => {
      const projectId = params.projectId
      const commitUuid = params.commitUuid

      if (!projectId || !commitUuid) {
        return NextResponse.json(
          { message: 'Project ID and Commit UUID are required' },
          { status: 400 },
        )
      }

      const commit = await new CommitsRepository(workspace.id)
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documents = await docsScope.getDocumentsAtCommit(commit).then((r) => r.unwrap())

      return NextResponse.json(documents, { status: 200 })
    },
  ),
)
