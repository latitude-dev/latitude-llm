import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  DocumentSuggestionsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

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
        .getCommitByUuid({ projectId, uuid: commitUuid })
        .then((r) => r.unwrap())

      const documentsRepository = new DocumentVersionsRepository(workspace.id)
      const document = await documentsRepository
        .getDocumentAtCommit({
          projectId: projectId,
          commitUuid: commitUuid,
          documentUuid: documentUuid,
        })
        .then((r) => r.unwrap())

      const suggestionsRepository = new DocumentSuggestionsRepository(
        workspace.id,
      )
      const suggestions = await suggestionsRepository
        .listByDocumentVersionWithDetails({ commit, document })
        .then((r) => r.unwrap())

      return NextResponse.json(suggestions, { status: 200 })
    },
  ),
)
