import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const providerApiKeysScope = new ProviderApiKeysRepository(workspace.id)
      const rows = await providerApiKeysScope
        .findAll()
        .then((r) => r.unwrap())
        .then((r) => r.map(providerApiKeyPresenter))

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
