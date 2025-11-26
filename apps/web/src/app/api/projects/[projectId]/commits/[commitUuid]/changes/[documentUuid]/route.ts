'use server'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { DiffValue } from '@latitude-data/constants'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
function documentContent(document?: DocumentVersion) {
  if (!document) return undefined
  if (document.deletedAt) return undefined
  return document.content
}

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { projectId: string; commitUuid: string; documentUuid: string }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, documentUuid } = params

      if (!projectId || !commitUuid || !documentUuid) {
        return NextResponse.json(
          { message: 'Project ID, Commit UUID and Document UUID are required' },
          { status: 400 },
        )
      }

      const commitRepo = new CommitsRepository(workspace.id)
      const commit = await commitRepo
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())

      const docsRepo = new DocumentVersionsRepository(workspace.id)

      const curentDocumentVersion = await docsRepo
        .getDocumentAtCommit({
          projectId: Number(projectId),
          commitUuid,
          documentUuid,
        })
        .then((r) => r.unwrap())

      const result: DiffValue = {
        newValue: documentContent(curentDocumentVersion),
        oldValue: undefined,
      }

      const previousCommit = await commitRepo.getPreviousCommit(commit)
      if (previousCommit) {
        const previousDocumentVersion = await docsRepo.getDocumentAtCommit({
          projectId: Number(projectId),
          commitUuid: previousCommit.uuid,
          documentUuid,
        })
        result.oldValue = documentContent(previousDocumentVersion.value)
      }

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
