import { ToolDefinition } from '@latitude-data/constants'
import { LatitudeError } from '../../errors'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools, ToolSource } from './types'
import {
  AI_PROVIDERS_WITH_BUILTIN_TOOLS,
  LatitudePromptConfig,
} from '@latitude-data/constants/latitudePromptSchema'

type ToolTuple = [string, ToolDefinition]
function filterProviderTools([name]: ToolTuple) {
  return !AI_PROVIDERS_WITH_BUILTIN_TOOLS.includes(name)
}

function buildDefinition([name, definition]: ToolTuple) {
  return [
    name,
    {
      definition,
      sourceData: { source: ToolSource.Client },
    },
  ]
}

export function resolveClientTools({
  config,
}: {
  config: LatitudePromptConfig
}): TypedResult<ResolvedTools, LatitudeError> {
  const tools = config.tools

  if (!tools) return Result.ok({})

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    return Result.ok(
      Object.fromEntries(
        Object.entries(tools).filter(filterProviderTools).map(buildDefinition),
      ),
    )
  }

  // Filter Latitude tools that are strings
  const clientToolDefinitions: Record<string, ToolDefinition> = Object.assign(
    {},
    ...tools.filter((t) => typeof t !== 'string'),
  )

  return Result.ok(
    Object.fromEntries(
      Object.entries(clientToolDefinitions)
        .filter(filterProviderTools)
        .map(buildDefinition),
    ),
  )
}
