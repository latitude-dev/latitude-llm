import { BadRequestError } from '@latitude-data/core/lib/errors'
import { generateCsvFromSpans } from '@latitude-data/core/services/datasets/generateCsvFromSpans'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
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
      const spanIdentifiersRaw = formData.get('spanIdentifiers')

      if (!spanIdentifiersRaw) {
        throw new BadRequestError('No span identifiers provided')
      }

      const spanIdentifiers: Array<{ traceId: string; spanId: string }> =
        JSON.parse(spanIdentifiersRaw as string)

      if (!spanIdentifiers?.length) {
        throw new BadRequestError('No span identifiers provided')
      }

      if (
        !spanIdentifiers.every(
          (id) =>
            typeof id.traceId === 'string' && typeof id.spanId === 'string',
        )
      ) {
        throw new BadRequestError('Invalid span identifiers provided')
      }

      const csvFile = await generateCsvFromSpans({
        workspace,
        data: { spanIdentifiers },
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
