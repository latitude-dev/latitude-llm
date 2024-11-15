'use server'

import { DocumentVersion } from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
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
    async (_: NextRequest, { params, workspace }) => {
      const projectId = params.projectId
      const commitUuid = params.commitUuid

      if (!projectId || !commitUuid) {
        throw new BadRequestError('Project ID and Commit UUID are required')
      }

      const commit = await new CommitsRepository(workspace.id)
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())
      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documents = await docsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      return NextResponse.json(documents, { status: 200 })
    },
  ),
)
