import { BadRequestError } from '@latitude-data/core/lib/errors'
import { generateCsvFromSpans } from '@latitude-data/core/services/datasets/generateCsvFromSpans'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { SpansRepository } from '@latitude-data/core/repositories'

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
      const documentLogUuidsRaw = formData.get('documentLogUuids')

      if (!documentLogUuidsRaw) {
        throw new BadRequestError('No conversations provided')
      }

      const documentLogUuids = JSON.parse(documentLogUuidsRaw as string)
      if (!documentLogUuids?.length) {
        throw new BadRequestError('No conversations provided')
      }

      const spansRepo = new SpansRepository(workspace.id)
      const spanIdentifiers =
        await spansRepo.getSpanIdentifiersByDocumentLogUuids(documentLogUuids)

      if (!spanIdentifiers.length) {
        throw new BadRequestError(
          'No spans found for the provided conversations',
        )
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
