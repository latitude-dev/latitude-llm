import { findAllProviderApiKeys } from '@latitude-data/core/queries/providerApiKeys/findAll'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
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
      const rows = await findAllProviderApiKeys({ workspaceId: workspace.id })
      return NextResponse.json(rows.map(providerApiKeyPresenter), {
        status: 200,
      })
    },
  ),
)
