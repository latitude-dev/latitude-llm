import { LatitudeTool } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { StreamManager } from '..'
import {
  getLatitudeToolDefinition,
  getLatitudeToolInternalName,
} from '../../../services/latitudeTools/helpers'
import { TelemetryContext } from '../../../telemetry'
import { BadRequestError, LatitudeError, NotFoundError } from '../../errors'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools } from './types'
import { publisher } from '../../../events/publisher'
import { Tool } from 'ai'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { findFirstUserInWorkspace } from '../../../data-access/users'

export function resolveLatitudeTools({
  config,
  streamManager,
}: {
  config: LatitudePromptConfig
  streamManager: StreamManager
}): TypedResult<ResolvedTools, LatitudeError> {
  const newSchemaResult = resolveLatitudeToolsFromNewSchema({
    config,
    streamManager,
  })
  if (newSchemaResult.error) return newSchemaResult

  return Result.ok(newSchemaResult.unwrap())
}

const ALL_LATITUDE_RESOLVED_TOOLS = (context: TelemetryContext) =>
  Object.fromEntries(
    Object.values(LatitudeTool).map((latitudeToolName) => [
      getLatitudeToolInternalName(latitudeToolName),
      {
        definition: getLatitudeToolDefinition(latitudeToolName, context)!,
        sourceData: {
          source: ToolSource.Latitude,
          latitudeTool: latitudeToolName,
        },
      },
    ]),
  )

function resolveLatitudeToolsFromNewSchema({
  config,
  streamManager,
}: {
  config: LatitudePromptConfig
  streamManager: StreamManager
}) {
  const tools = config.tools
  if (!tools) {
    return Result.ok({})
  }

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    // There are no latitude tools in old schema
    return Result.ok({})
  }

  // New schema
  const toolIds = tools.filter((t) => typeof t === 'string')
  const latitudeToolNames = toolIds // Any other tool ids that are not from "latitude" are computed as Integration Tools
    .map((t) => t.split('/'))
    .filter(([toolSource]) => toolSource === 'latitude')
    .map(([, ...rest]) => rest.join('/'))

  const resolvedTools: ResolvedTools = {}
  for (const latitudeToolName of latitudeToolNames) {
    if (latitudeToolName === '') {
      // 'latitude' was used as the whole toolId, without any '/' separator
      return Result.error(
        new BadRequestError(`You must specify a tool name after 'latitude/'`),
      )
    }

    if (latitudeToolName === '*') {
      Object.assign(
        resolvedTools,
        ALL_LATITUDE_RESOLVED_TOOLS(streamManager.$completion!.context),
      )
      continue
    }

    if (
      !Object.values(LatitudeTool).includes(latitudeToolName as LatitudeTool)
    ) {
      return Result.error(
        new NotFoundError(
          `There is no Latitude tool with the name '${latitudeToolName}'`,
        ),
      )
    }

    resolvedTools[
      getLatitudeToolInternalName(latitudeToolName as LatitudeTool)
    ] = {
      definition: instrumentLatitudeTool(
        getLatitudeToolDefinition(
          latitudeToolName as LatitudeTool,
          streamManager.$completion!.context,
        )!,
        {
          streamManager,
          name: latitudeToolName,
        },
      ),
      sourceData: {
        source: ToolSource.Latitude,
        latitudeTool: latitudeToolName as LatitudeTool,
      },
    }
  }

  return Result.ok(resolvedTools)
}

function instrumentLatitudeTool(
  definition: Tool,
  { streamManager, name }: { streamManager: StreamManager; name: string },
) {
  const originalExecute = definition.execute!
  definition.execute = async (...args) => {
    const user = await findFirstUserInWorkspace(streamManager.workspace)

    publisher.publishLater({
      type: 'toolExecuted',
      data: {
        workspaceId: streamManager.workspace.id,
        type: 'latitude',
        toolName: name,
        userEmail: user?.email,
      },
    })

    return originalExecute(...args)
  }

  return definition
}
