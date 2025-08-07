import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { generateCsvFromLogs } from '@latitude-data/core/services/datasets/generateCsvFromLogs'
import { NextRequest, NextResponse } from 'next/server'

export const POST = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const formData = await request.formData()
      const idsRaw = formData.get('ids')

      if (!idsRaw) {
        throw new BadRequestError('No document log ids provided')
      }

      const ids: string[] = JSON.parse(idsRaw as string)

      if (!ids?.length) {
        throw new BadRequestError('No document log ids provided')
      }

      if (ids.some((id) => isNaN(+id))) {
        throw new BadRequestError('Invalid document log ids provided')
      }
      const documentLogIds = ids.map(Number)
      const csvFile = await generateCsvFromLogs({
        workspace,
        data: { documentLogIds },
      }).then((r) => r.unwrap())

      return new NextResponse(csvFile, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="data.csv"',
        },
      })
    },
  ),
)
