import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IResult = ReturnType<typeof serializeProviderLog>

export const GET = errorHandler<{}, IResult[]>(
  authHandler<{}, IResult[]>(
    async (req: NextRequest, _res: NextResponse, { workspace }) => {
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
