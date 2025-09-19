import { Workspace } from '@latitude-data/core/browser'
import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { hydrateProviderLog } from '@latitude-data/core/services/providerLogs/hydrate'
import { Result } from '@latitude-data/core/lib/Result'

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
      const providerLogResult = await providerLogsScope.find(
        Number(providerLogId),
      )

      if (!Result.isOk(providerLogResult)) {
        return NextResponse.json(
          { message: 'Provider log not found' },
          { status: 404 },
        )
      }

      // Hydrate single provider logs with file storage data
      const hydratedResult = await hydrateProviderLog(
        providerLogResult.unwrap(),
      )
      const hydratedProviderLog = hydratedResult.unwrap()

      return NextResponse.json(
        serializeProviderLog(hydratedProviderLog as any),
        {
          status: 200,
        },
      )
    },
  ),
)
