import { Workspace } from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { generateCsvFromDocumentLogs } from '@latitude-data/core/services/documentLogs/generateCsvFromDocumentLogs'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const documentLogIds = request.nextUrl.searchParams
        .get('ids')
        ?.split(',')
        .map(Number)

      if (!documentLogIds?.length) {
        throw new BadRequestError('No document log ids provided')
      }

      if (documentLogIds.some((id) => isNaN(id))) {
        throw new BadRequestError('Invalid document log ids provided')
      }

      const result = await generateCsvFromDocumentLogs({
        workspace,
        documentLogIds,
      }).then((r) => r.unwrap())

      return NextResponse.json(result, { status: 200 })
    },
  ),
)
