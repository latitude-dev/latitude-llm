import { findProviderApiKeyById } from '@latitude-data/core/queries/providerApiKeys/findById'
import { getProviderApiKeyUsage } from '@latitude-data/core/queries/providerApiKeys/getUsage'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

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

      const providerApiKey = await findProviderApiKeyById({
        workspaceId: workspace.id,
        id: providerApiKeyId,
      })
      const usage = await getProviderApiKeyUsage({
        workspaceId: workspace.id,
        name: providerApiKey.name,
      })

      return NextResponse.json(usage, { status: 200 })
    },
  ),
)
