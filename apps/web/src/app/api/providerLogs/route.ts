import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const documentUuid = searchParams.get('documentUuid')
      const documentLogUuid = searchParams.get('documentLogUuid')
      const scope = new ProviderLogsRepository(workspace.id)

      let result
      if (documentLogUuid) {
        result = await scope
          .findByDocumentLogUuid(documentLogUuid, { limit: 1000 })
          .then((r) => r.unwrap())
      } else if (documentUuid) {
        result = await scope
          .findByDocumentUuid(documentUuid)
          .then((r) => r.unwrap())
      } else {
        result = await scope.findAll({ limit: 1000 }).then((r) => r.unwrap())
      }

      return NextResponse.json(result.map(serializeProviderLog), {
        status: 200,
      })
    },
  ),
)
