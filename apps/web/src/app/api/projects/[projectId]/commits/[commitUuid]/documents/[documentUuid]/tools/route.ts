import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { lookupDocumentToolsRecursively } from '@latitude-data/core/services/documents/tools/lookupRecursive'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, documentUuid } = params

      const commitsRepository = new CommitsRepository(workspace.id)
      const commit = await commitsRepository
        .getCommitByUuid({
          projectId: projectId,
          uuid: commitUuid,
        })
        .then((r) => r.unwrap())

      const documentsRepository = new DocumentVersionsRepository(workspace.id)
      const documents = await documentsRepository
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      const toolsManifest = await lookupDocumentToolsRecursively({
        documentUuid,
        documents,
        workspace,
      }).then((r) => r.unwrap())

      return NextResponse.json(toolsManifest, { status: 200 })
    },
  ),
)
