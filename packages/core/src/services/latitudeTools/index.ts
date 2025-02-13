import { LATITUDE_TOOLS_CONFIG_NAME } from '../../constants'
import {
  BadRequestError,
  LatitudeError,
  PromisedResult,
  Result,
  TypedResult,
} from '../../lib'
import {
  getLatitudeToolDefinition,
  getLatitudeToolInternalName,
  getLatitudeToolName,
} from './helpers'
import { LATITUDE_TOOLS } from './tools'
import {
  LatitudeTool,
  LatitudeToolInternalName,
  LatitudeToolCall,
  ToolDefinition,
} from './types'
import { Config } from '@latitude-data/compiler'

export async function executeLatitudeToolCall(
  toolCall: LatitudeToolCall,
): PromisedResult<unknown, LatitudeError> {
  const toolName = getLatitudeToolName(toolCall.name)
  const method = LATITUDE_TOOLS.find((tool) => tool.name === toolName)?.method
  if (!method) {
    return Result.error(
      new BadRequestError(`Unsupported built-in tool: ${toolCall.name}`),
    )
  }

  try {
    const response = await method(toolCall.arguments)
    return response
  } catch (error) {
    return Result.error(error as LatitudeError)
  }
}

export function injectLatitudeToolsConfig(
  config: Config,
): TypedResult<Config, LatitudeError> {
  const builtInTools: LatitudeTool[] =
    (config[LATITUDE_TOOLS_CONFIG_NAME] as LatitudeTool[] | undefined) ?? []
  if (
    !Array.isArray(builtInTools) ||
    builtInTools.some((tool) => typeof tool !== 'string')
  ) {
    return Result.error(
      new BadRequestError('Built-in tools must be an array of strings'),
    )
  }

  if (!builtInTools.length) return Result.ok(config)

  const notFoundTool = builtInTools.find(
    (tool) => !Object.values(LatitudeTool).includes(tool),
  )
  if (notFoundTool) {
    return Result.error(
      new BadRequestError(`Unsupported built-in tool: ${notFoundTool}`),
    )
  }

  const { [LATITUDE_TOOLS_CONFIG_NAME]: _, ...restConfig } = config
  return Result.ok({
    ...restConfig,
    tools: {
      ...(restConfig.tools ?? {}),
      ...builtInTools.reduce(
        (acc, tool) => {
          const internalToolName = getLatitudeToolInternalName(tool)
          const toolDefinition = getLatitudeToolDefinition(tool)!

          acc[internalToolName] = toolDefinition
          return acc
        },
        {} as Record<LatitudeToolInternalName, ToolDefinition>,
      ),
    },
  })
}
