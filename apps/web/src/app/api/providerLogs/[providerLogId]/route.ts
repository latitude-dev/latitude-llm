import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { providerLogId: string }
        workspace: Workspace
      },
    ) => {
      const { providerLogId } = params

      if (!providerLogId) {
        return NextResponse.json(
          { message: `Provider log ID is required` },
          { status: 400 },
        )
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
