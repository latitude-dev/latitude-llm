import { LatitudeTool } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { StreamManager } from '..'
import {
  getLatitudeToolDefinition,
  getLatitudeToolInternalName,
} from '../../../services/latitudeTools/helpers'
import { BadRequestError, LatitudeError, NotFoundError } from '../../errors'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools, ToolSource } from './types'
import { publisher } from '../../../events/publisher'
import { Tool } from 'ai'
import { DocumentRunPromptSource } from '../../../constants'

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

const resolveAllLatitudeeTools = ({
  streamManager,
  config,
}: {
  streamManager: StreamManager
  config: LatitudePromptConfig
}) =>
  Object.fromEntries(
    Object.values(LatitudeTool).map((latitudeToolName) => [
      getLatitudeToolInternalName(latitudeToolName),
      {
        definition: getLatitudeToolDefinition({
          config,
          tool: latitudeToolName,
          context: streamManager.$completion!.context,
          document: (streamManager.promptSource as DocumentRunPromptSource)
            .document,
        })!,
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
  let latitudeToolNames: string[] = []
  // If config contains a memory key with a userId key, include storeMemory and getMemory tools
  if (config.memory) {
    if (!latitudeToolNames.includes('storeMemory')) {
      latitudeToolNames.push('storeMemory')
    }
    if (!latitudeToolNames.includes('getMemory')) {
      latitudeToolNames.push('getMemory')
    }
  }

  const tools = config.tools
  if (!tools && !latitudeToolNames.length) {
    return Result.ok({})
  }

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    // There are no latitude tools in old schema
    return Result.ok({})
  }

  // New schema
  const toolIds = tools?.filter((t) => typeof t === 'string')
  latitudeToolNames = latitudeToolNames.concat(
    toolIds
      ?.map((t) => t.split('/'))
      ?.filter(([toolSource]) => toolSource === 'latitude')
      ?.map(([, ...rest]) => rest.join('/')) ?? [],
  ) // Any other tool ids that are not from "latitude" are computed as Integration Tools

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
        resolveAllLatitudeeTools({ streamManager, config }),
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
        getLatitudeToolDefinition({
          tool: latitudeToolName as LatitudeTool,
          context: streamManager.$completion!.context,
          config,
          document: (streamManager.promptSource as DocumentRunPromptSource)
            .document,
        })!,
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
    publisher.publishLater({
      type: 'toolExecuted',
      data: {
        workspaceId: streamManager.workspace.id,
        type: 'latitude',
        toolName: name,
      },
    })

    return originalExecute(...args)
  }

  return definition
}
