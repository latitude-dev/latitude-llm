import { type Workspace } from '../../schema/models/types/Workspace'
import { findAllIntegrations } from '../../queries/integrations/findAll'
import { Result } from '@latitude-data/core/lib/Result'
import { buildLatitudeIntegration } from './buildLatitudeIntegration'

export async function listIntegrations(workspace: Workspace) {
  const integrations = await findAllIntegrations({ workspaceId: workspace.id })
  const latitudeIntegration = buildLatitudeIntegration(workspace)
  return Result.ok([latitudeIntegration, ...integrations])
}
