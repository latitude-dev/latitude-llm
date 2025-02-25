import {
  PromptConfig,
  LatitudeTool,
  ToolDefinition,
  VercelConfig,
} from '@latitude-data/constants'
import { Result, TypedResult } from '../../../Result'
import { BadRequestError, LatitudeError, NotFoundError } from '../../../errors'
import {
  getLatitudeToolDefinition,
  getLatitudeToolInternalName,
} from '../../../../services/latitudeTools/helpers'

const ALL_LATITUDE_TOOLS = Object.fromEntries(
  Object.values(LatitudeTool).map((latitudeToolName) => [
    getLatitudeToolInternalName(latitudeToolName),
    getLatitudeToolDefinition(latitudeToolName)!,
  ]),
)

function getToolFromId(
  toolId: string,
): TypedResult<Record<string, ToolDefinition>, LatitudeError> {
  const [toolSource, toolName, ...other] = toolId
    .split('/')
    .map((s) => s.trim())
  if (!toolSource || !toolName || other.length) {
    return Result.error(new BadRequestError(`Invalid tool ID: '${toolId}'`))
  }

  if (toolSource === 'latitude') {
    const toolName = toolId.slice('latitude:'.length) as LatitudeTool | '*'
    if (toolName === '*') {
      return Result.ok(ALL_LATITUDE_TOOLS)
    }

    if (!Object.values(LatitudeTool).includes(toolName)) {
      return Result.error(
        new NotFoundError(
          `There is no Latitude tool with the name '${toolName}'`,
        ),
      )
    }

    return Result.ok({
      [getLatitudeToolInternalName(toolName)]:
        getLatitudeToolDefinition(toolName)!,
    })
  }

  // TODO: This will include integrations
  return Result.error(new NotFoundError(`Unknown tool source: '${toolSource}'`))
}

function inferToolsFromConfig(
  config: PromptConfig,
): TypedResult<Record<string, ToolDefinition>, LatitudeError> {
  if (!config.tools) {
    return Result.ok({})
  }

  const tools = config.tools ?? []

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    return Result.ok(tools)
  }

  // New schema: tools is an array
  if (Array.isArray(tools)) {
    let newTools: Record<string, ToolDefinition> = {}
    for (const tool of tools) {
      if (typeof tool === 'string') {
        const toolResult = getToolFromId(tool)
        if (toolResult.error) return toolResult
        newTools = { ...newTools, ...toolResult.unwrap() }
      } else {
        newTools = { ...newTools, ...tool }
      }
    }

    return Result.ok(newTools)
  }

  return Result.error(new BadRequestError('Invalid tools schema'))
}

function getLatitudeToolsDefinitions(
  config: PromptConfig,
): TypedResult<Record<string, ToolDefinition>, LatitudeError> {
  if (!config.latitudeTools) {
    return Result.ok({})
  }

  const unknownLatitudeTool = config.latitudeTools.find(
    (tool) => !Object.values(LatitudeTool).includes(tool as LatitudeTool),
  )
  if (unknownLatitudeTool) {
    return Result.error(
      new NotFoundError(
        `There is no Latitude tool with the name '${unknownLatitudeTool}'`,
      ),
    )
  }

  return Result.ok(
    Object.fromEntries(
      config.latitudeTools.map((latitudeToolName) => [
        getLatitudeToolInternalName(latitudeToolName as LatitudeTool),
        getLatitudeToolDefinition(latitudeToolName as LatitudeTool)!,
      ]),
    ),
  )
}

export function injectCorrectToolsConfig(
  config: PromptConfig,
): TypedResult<VercelConfig, LatitudeError> {
  const latitudeToolsResult = getLatitudeToolsDefinitions(config)
  if (latitudeToolsResult.error) return latitudeToolsResult

  const regularToolsResult = inferToolsFromConfig(config)
  if (regularToolsResult.error) return regularToolsResult

  const { latitudeTools: _1, tools: _2, ...rest } = config

  const tools = {
    ...latitudeToolsResult.unwrap(),
    ...regularToolsResult.unwrap(),
  }

  return Result.ok({
    ...rest,
    tools: Object.keys(tools).length ? tools : undefined,
  })
}
