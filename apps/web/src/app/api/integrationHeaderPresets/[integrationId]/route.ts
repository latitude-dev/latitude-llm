import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { listIntegrationHeaderPresets } from '@latitude-data/core/data-access/integrations/headerPresets/list'
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
      const presets = await listIntegrationHeaderPresets(
        workspace.id,
        Number(integrationId),
      ).then((r) => r.unwrap())

      return NextResponse.json(presets, { status: 200 })
    },
  ),
)
