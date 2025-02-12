import { Config } from '@latitude-data/compiler'
import {
  LATITUDE_TOOLS_CONFIG_NAME,
  LATITUDE_TOOLS_DEFINITION,
  LatitudeTool,
  ToolDefinition,
} from '../../constants'
import { BadRequestError, LatitudeError, Result, TypedResult } from '../../lib'
import {
  getLatitudeToolInternalName,
  LatitudeToolInternalName,
} from './definitions'

export function injectBuiltInToolsConfig(
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
          const toolDefinition = LATITUDE_TOOLS_DEFINITION[tool]

          acc[internalToolName] = toolDefinition
          return acc
        },
        {} as Record<LatitudeToolInternalName, ToolDefinition>,
      ),
    },
  })
}
