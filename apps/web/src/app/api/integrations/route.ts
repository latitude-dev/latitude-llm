import { IntegrationDto, Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { IntegrationType } from '@latitude-data/constants'

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
      const integrationsScope = new IntegrationsRepository(workspace.id)
      const rows = await integrationsScope.findAll().then((r) => r.unwrap())

      const latitudeIntegration: IntegrationDto = {
        id: -1,
        name: 'latitude',
        type: IntegrationType.Latitude,
        hasTools: true,
        hasTriggers: false,
        workspaceId: workspace.id,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        authorId: workspace.creatorId!,
        lastUsedAt: workspace.updatedAt,
        configuration: null,
        deletedAt: null,
        mcpServerId: null,
      }

      return NextResponse.json([latitudeIntegration, ...rows], { status: 200 })
    },
  ),
)
