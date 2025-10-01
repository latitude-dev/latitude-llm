import { LatitudeTool } from '@latitude-data/constants'
import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import { ResolvedTools, ToolSource } from './types'
import {
  getLatitudeToolDefinition,
  getLatitudeToolInternalName,
} from '../../../../services/latitudeTools/helpers'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

const ALL_LATITUDE_RESOLVED_TOOLS = Object.fromEntries(
  Object.values(LatitudeTool).map((latitudeToolName) => [
    getLatitudeToolInternalName(latitudeToolName),
    {
      definition: getLatitudeToolDefinition(latitudeToolName)!,
      sourceData: {
        source: ToolSource.Latitude,
        latitudeTool: latitudeToolName,
      },
    },
  ]),
)

function resolveLatitudeToolsFromNewSchema(config: LatitudePromptConfig) {
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
      Object.assign(resolvedTools, ALL_LATITUDE_RESOLVED_TOOLS)
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

    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    resolvedTools[
      getLatitudeToolInternalName(latitudeToolName as LatitudeTool)
    ] = {
      definition: getLatitudeToolDefinition(latitudeToolName as LatitudeTool)!,
      sourceData: {
        source: ToolSource.Latitude,
        latitudeTool: latitudeToolName as LatitudeTool,
      },
    }
  }

  return Result.ok(resolvedTools)
}

export function resolveLatitudeTools({
  config,
}: {
  config: LatitudePromptConfig
}): TypedResult<ResolvedTools, LatitudeError> {
  const newSchemaResult = resolveLatitudeToolsFromNewSchema(config)
  if (newSchemaResult.error) return newSchemaResult

  return Result.ok({
    ...newSchemaResult.unwrap(),
  })
}
