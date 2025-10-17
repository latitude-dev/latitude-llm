import { BadRequestError } from '@latitude-data/core/lib/errors'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { projectId: string }
        workspace: Workspace
      },
    ) => {
      const { projectId } = params

      if (!projectId) {
        throw new BadRequestError('Project ID is required')
      }

      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documents = await docsScope
        .getDocumentsForImport(Number(projectId))
        .then((r) => r.unwrap())

      return NextResponse.json(documents, { status: 200 })
    },
  ),
)
