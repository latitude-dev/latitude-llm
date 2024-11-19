import { BadRequestError } from '@latitude-data/core/lib/errors'
import { Ok } from '@latitude-data/core/lib/Result'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { projectId?: string }

type ResponseResult = Awaited<
  ReturnType<typeof DocumentVersionsRepository.prototype.getDocumentsForImport>
>
type DocumentsImported = ResponseResult extends Ok<infer T> ? T : never

export const GET = errorHandler<IParam, DocumentsImported>(
  authHandler<IParam, DocumentsImported>(
    async (_: NextRequest, { params, workspace }) => {
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
