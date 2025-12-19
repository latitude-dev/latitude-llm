import { z } from 'zod'
import { DocumentVersionsRepository } from '@latitude-data/core/repositories'
import { flattenErrors } from '@latitude-data/core/lib/zodUtils'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { UnprocessableEntityError } from '@latitude-data/constants/errors'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

const paramsSchema = z.object({
  projectId: z.number().int().positive(),
  commitUuid: z.string(),
})

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { documentUuid } = params
      const searchParams = req.nextUrl.searchParams
      const parseResult = paramsSchema.safeParse({
        projectId: Number(searchParams.get('projectId')),
        commitUuid: searchParams.get('commitUuid') ?? undefined,
      })

      if (!parseResult.success) {
        throw new UnprocessableEntityError(
          'Invalid query parameters',
          flattenErrors(parseResult),
        )
      }

      const docsScope = new DocumentVersionsRepository(workspace.id)
      const documentVersion = await docsScope
        .getDocumentAtCommit({
          projectId: parseResult.data.projectId,
          commitUuid: parseResult.data.commitUuid,
          documentUuid,
        })
        .then((r) => r.unwrap())

      return NextResponse.json({
        ...documentVersion,
        projectId: parseResult.data.projectId,
        commitUuid: parseResult.data.commitUuid,
      })
    },
  ),
)
