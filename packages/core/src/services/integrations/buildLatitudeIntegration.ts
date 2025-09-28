import { IntegrationDto, Workspace } from '../../schema/types'
import { IntegrationType } from '@latitude-data/constants'

/**
 * Builds a virtual Latitude integration DTO for internal use in Latte
 * @param workspace - The workspace to create the integration for
 * @returns IntegrationDto representing the Latitude integration
 */
export function buildLatitudeIntegration(workspace: Workspace): IntegrationDto {
  return {
    id: -1,
    name: IntegrationType.Latitude,
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
}
