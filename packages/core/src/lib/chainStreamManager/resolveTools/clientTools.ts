import { PromptConfig, ToolDefinition } from '@latitude-data/constants'
import { LatitudeError } from '../../errors'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools, ToolSource } from './types'
export function resolveClientTools({
  config,
}: {
  config: PromptConfig
}): TypedResult<ResolvedTools, LatitudeError> {
  const tools = config.tools
  if (!tools) {
    return Result.ok({})
  }

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    return Result.ok(
      Object.fromEntries(
        Object.entries(tools).map(([name, definition]) => [
          name,
          { definition, sourceData: { source: ToolSource.Client } },
        ]),
      ),
    )
  }

  // New schema
  const clientToolDefinitions: Record<string, ToolDefinition> = Object.assign(
    {},
    ...tools.filter((t) => typeof t !== 'string'),
  )

  return Result.ok(
    Object.fromEntries(
      Object.entries(clientToolDefinitions).map(([name, definition]) => [
        name,
        { definition, sourceData: { source: ToolSource.Client } },
      ]),
    ),
  )
}
