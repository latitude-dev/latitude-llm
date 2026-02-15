import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { findIntegrationHeaderPresetsByIntegration } from '@latitude-data/core/queries/integrationHeaderPresets/findByIntegration'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
        params,
      }: {
        workspace: Workspace
        params: Promise<{ integrationId: string }>
      },
    ) => {
      const { integrationId } = await params
      const presets = await findIntegrationHeaderPresetsByIntegration({
        workspaceId: workspace.id,
        integrationId: Number(integrationId),
      })

      return NextResponse.json(presets, { status: 200 })
    },
  ),
)
