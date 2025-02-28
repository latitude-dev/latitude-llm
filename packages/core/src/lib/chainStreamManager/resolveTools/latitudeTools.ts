import {
  LatitudeTool,
  PromptConfig,
  ToolDefinition,
} from '@latitude-data/constants'
import { BadRequestError, LatitudeError, NotFoundError } from '../../errors'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools, ToolSource, ToolSourceData } from './types'
import {
  getLatitudeToolDefinition,
  getLatitudeToolInternalName,
} from '../../../services/latitudeTools/helpers'

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

function resolveLatitudeToolsFromLegacySchema({
  latitudeTools,
}: {
  latitudeTools?: string[]
}): TypedResult<ResolvedTools, LatitudeError> {
  if (!latitudeTools?.length) {
    return Result.ok({})
  }

  const unknownLatitudeTool = latitudeTools.find(
    (tool) => !Object.values(LatitudeTool).includes(tool as LatitudeTool),
  )
  if (unknownLatitudeTool) {
    return Result.error(
      new NotFoundError(
        `There is no Latitude tool with the name '${unknownLatitudeTool}'`,
      ),
    )
  }

  const resolvedLatitudeToolsEntries: [
    string,
    { definition: ToolDefinition; sourceData: ToolSourceData },
  ][] = (latitudeTools as LatitudeTool[]).map((latitudeToolName) => [
    getLatitudeToolInternalName(latitudeToolName),
    {
      definition: getLatitudeToolDefinition(latitudeToolName)!,
      sourceData: {
        source: ToolSource.Latitude,
        latitudeTool: latitudeToolName,
      },
    },
  ])

  return Result.ok(Object.fromEntries(resolvedLatitudeToolsEntries))
}

function resolveLatitudeToolsFromNewSchema(config: PromptConfig) {
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
  config: PromptConfig
}): TypedResult<ResolvedTools, LatitudeError> {
  const oldSchemaResult = resolveLatitudeToolsFromLegacySchema(config)
  if (oldSchemaResult.error) return oldSchemaResult

  const newSchemaResult = resolveLatitudeToolsFromNewSchema(config)
  if (newSchemaResult.error) return newSchemaResult

  return Result.ok({
    ...oldSchemaResult.unwrap(),
    ...newSchemaResult.unwrap(),
  })
}
