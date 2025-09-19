import { Workspace } from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { previewDatasetFromLogs } from '@latitude-data/core/services/datasets/previewFromLogs'
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
      const query = request.nextUrl.searchParams
      const ids = query.get('documentLogIds')?.split(',').map(Number) ?? []
      const result = await previewDatasetFromLogs({
        workspace,
        data: {
          name: query.get('name') ?? '',
          documentLogIds: ids,
        },
      })

      if (!Result.isOk(result)) {
        throw new BadRequestError(result.error.message)
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
