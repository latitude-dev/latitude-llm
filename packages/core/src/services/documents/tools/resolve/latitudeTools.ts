import { StreamManager } from '../../../../lib/streamManager'
import { LatitudeError, NotFoundError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import { ToolManifest } from '@latitude-data/constants/tools'
import { publisher } from '../../../../events/publisher'
import { Tool } from 'ai'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { findFirstUserInWorkspace } from '../../../../data-access/users'
import { LATITUDE_TOOLS } from '../../../../services/latitudeTools/tools'

export function resolveLatitudeToolDefinition({
  toolName,
  toolManifest,
  streamManager,
}: {
  toolName: string
  toolManifest: ToolManifest<ToolSource.Latitude>
  streamManager: StreamManager
}): TypedResult<Tool, LatitudeError> {
  const latitudeTool = toolManifest.sourceData.latitudeTool
  const toolDefinition = LATITUDE_TOOLS.find((t) => t.name === latitudeTool)
  if (!toolDefinition) {
    return Result.error(
      new NotFoundError(
        `There is no Latitude tool with the name '${latitudeTool}'`,
      ),
    )
  }

  const context = streamManager.$context
  const definition = toolDefinition.definition(context)!

  return Result.ok({
    ...toolManifest.definition,
    execute: async (...args) => {
      // Instrument additional telemetry
      const user = await findFirstUserInWorkspace(streamManager.workspace)
      publisher.publishLater({
        type: 'toolExecuted',
        data: {
          workspaceId: streamManager.workspace.id,
          type: 'latitude',
          toolName,
          userEmail: user?.email,
        },
      })

      return await definition.execute?.(...args)
    },
  })
}
