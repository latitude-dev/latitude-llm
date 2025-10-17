import { type Workspace } from '../../schema/models/types/Workspace'
import { IntegrationsRepository } from '@latitude-data/core/repositories'
import { Result } from '@latitude-data/core/lib/Result'
import { buildLatitudeIntegration } from './buildLatitudeIntegration'

export async function listIntegrations(workspace: Workspace) {
  const integrationsScope = new IntegrationsRepository(workspace.id)
  const integrations = await integrationsScope.findAll().then((r) => r.unwrap())
  // Adding a fake integration for Latitude, to later be used to find its tools and triggers
  const latitudeIntegration = buildLatitudeIntegration(workspace)
  return Result.ok([latitudeIntegration, ...integrations])
}
