import { BadRequestError } from '@latitude-data/core/lib/errors'
import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { providerLogId: string }
type ReturnResponse = ReturnType<typeof serializeProviderLog>

export const GET = errorHandler<IParam, ReturnResponse>(
  authHandler<IParam, ReturnResponse>(
    async (_: NextRequest, _res: NextResponse, { params, workspace }) => {
      const { providerLogId } = params

      if (!providerLogId) {
        throw new BadRequestError(`Provider log ID is required`)
      }

      const providerLogsScope = new ProviderLogsRepository(workspace.id)
      const providerLog = await providerLogsScope
        .find(Number(providerLogId))
        .then((r) => r.unwrap())

      return NextResponse.json(serializeProviderLog(providerLog), {
        status: 200,
      })
    },
  ),
)
