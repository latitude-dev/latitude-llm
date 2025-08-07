import { IntegrationDto, Workspace } from '@latitude-data/core/browser'
import { IntegrationType } from '@latitude-data/constants'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { Result } from '@latitude-data/core/lib/Result'

export async function listIntegrations(workspace: Workspace) {
  const integrationsScope = new IntegrationsRepository(workspace.id)
  const integrations = await integrationsScope.findAll().then((r) => r.unwrap())
  // Adding a fake integration for Latitude, to later be used to its their tools/triggers
  const latitudeIntegration: IntegrationDto = {
    id: -1,
    name: 'latitude',
    type: IntegrationType.Latitude,
    hasTools: true,
    hasTriggers: true,
    workspaceId: workspace.id,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    authorId: workspace.creatorId!,
    lastUsedAt: workspace.updatedAt,
    configuration: null,
    deletedAt: null,
    mcpServerId: null,
  }

  return Result.ok([latitudeIntegration, ...integrations])
}
