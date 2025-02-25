import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import {
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
        .listByDocumentVersionWithDetails({
          commitId: document.commitId,
          documentUuid: document.documentUuid,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(suggestions, { status: 200 })
    },
  ),
)
