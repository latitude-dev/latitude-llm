import { Config } from '@latitude-data/compiler'
import {
  BUILT_IN_TOOLS_CONFIG_NAME,
  LATITUDE_BUILT_IN_TOOLS_DEFINITION,
  LatitudeBuiltInToolName,
  ToolDefinition,
} from '../../constants'
import { BadRequestError, LatitudeError, Result, TypedResult } from '../../lib'

export function injectBuiltInTools(
  config: Config,
): TypedResult<Config, LatitudeError> {
  const builtInTools: LatitudeBuiltInToolName[] =
    (config[BUILT_IN_TOOLS_CONFIG_NAME] as
      | LatitudeBuiltInToolName[]
      | undefined) ?? []
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
    (tool) => !Object.values(LatitudeBuiltInToolName).includes(tool),
  )
  if (notFoundTool) {
    return Result.error(
      new BadRequestError(`Unsupported built-in tool: ${notFoundTool}`),
    )
  }

  const { [BUILT_IN_TOOLS_CONFIG_NAME]: _, ...restConfig } = config
  return Result.ok({
    ...restConfig,
    tools: {
      ...(restConfig.tools ?? {}),
      ...builtInTools.reduce(
        (acc, tool) => {
          acc[tool] = LATITUDE_BUILT_IN_TOOLS_DEFINITION[tool]
          return acc
        },
        {} as Record<LatitudeBuiltInToolName, ToolDefinition>,
      ),
    },
  })
}
