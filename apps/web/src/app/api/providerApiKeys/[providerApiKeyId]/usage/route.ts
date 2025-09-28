import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/types'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          providerApiKeyId: number
        }
        workspace: Workspace
      },
    ) => {
      const { providerApiKeyId } = params

      const repository = new ProviderApiKeysRepository(workspace.id)
      const providerApiKey = await repository
        .find(providerApiKeyId)
        .then((r) => r.unwrap())
      const usage = await repository
        .getUsage(providerApiKey.name)
        .then((r) => r.unwrap())

      return NextResponse.json(usage, { status: 200 })
    },
  ),
)
