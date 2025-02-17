import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { DocumentSuggestionsRepository } from '@latitude-data/core/repositories'
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
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { commitUuid, documentUuid } = params

      const repository = new DocumentSuggestionsRepository(workspace.id)
      const suggestions = await repository
        .listByDocumentVersionWithDetails({
          commitUuid: commitUuid,
          documentUuid: documentUuid,
        })
        .then((r) => r.unwrap())

      return NextResponse.json(suggestions, { status: 200 })
    },
  ),
)
