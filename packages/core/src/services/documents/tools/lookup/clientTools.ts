import { ToolDefinition } from '@latitude-data/constants'
import { ToolManifest, ToolManifestDict } from '@latitude-data/constants/tools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import {
  AI_PROVIDERS_WITH_BUILTIN_TOOLS,
  LatitudePromptConfig,
} from '@latitude-data/constants/latitudePromptSchema'
import { Result, TypedResult } from '../../../../lib/Result'
import { LatitudeError } from '@latitude-data/constants/errors'
import { jsonSchema } from 'ai'

export function lookupClientTools({
  config,
}: {
  config: Pick<LatitudePromptConfig, 'tools'>
}): TypedResult<ToolManifestDict<ToolSource.Client>, LatitudeError> {
  const tools = config.tools as
    | ToolDefinition[]
    | Record<string, ToolDefinition>
  if (!tools) return Result.ok({})

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (isOldToolsSchema(tools)) {
    return oldSchemaToolDeclarations({
      tools: tools as Record<string, ToolDefinition>,
    })
  }

  return newSchemaToolDeclarations({
    tools: tools as ToolDefinition[],
  })
}

function oldSchemaToolDeclarations({
  tools,
}: {
  tools: Record<string, ToolDefinition>
}): TypedResult<ToolManifestDict<ToolSource.Client>, LatitudeError> {
  return Result.ok(
    Object.fromEntries(
      Object.entries(tools).filter(filterProviderTools).map(buildDefinition),
    ),
  )
}

export function isOldToolsSchema(
  tools: Record<string, ToolDefinition> | Array<ToolDefinition>,
) {
  return typeof tools === 'object' && !Array.isArray(tools) && tools !== null
}

function newSchemaToolDeclarations({
  tools,
}: {
  tools: ToolDefinition[]
}): TypedResult<ToolManifestDict<ToolSource.Client>, LatitudeError> {
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

function filterProviderTools([name]: [string, ToolDefinition]) {
  return !AI_PROVIDERS_WITH_BUILTIN_TOOLS.includes(name)
}

/**
 * Builds a tool definition. if the tool has a defined handler in the stream
 * manager, it will be added to the definition so that it's automatically
 * executed by vercel AI sdk downstream.
 */
function buildDefinition([name, toolDefinition]: [string, ToolDefinition]): [
  string,
  ToolManifest<ToolSource.Client>,
] {
  const { description, parameters } = toolDefinition

  return [
    name,
    {
      definition: {
        description,
        inputSchema: jsonSchema(parameters),
      },
      sourceData: {
        source: ToolSource.Client,
      },
    },
  ]
}
