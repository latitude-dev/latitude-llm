import { z } from 'zod'
import { LatitudeTool } from '../config'
import { openAIToolsList } from './providers/openai/index'
import { zodJsonSchema } from './zodJsonSchema'

const toolDefinitionObject = z.record(
  z.object({
    description: z.string({
      required_error: 'You must provide a description for the tool',
    }),
    parameters: z
      .object({
        type: z.literal('object', {
          required_error: 'Parameters must be an object',
          invalid_type_error: 'Parameters must be an object',
        }),
        properties: z.record(zodJsonSchema),
        required: z.array(z.string()).optional(),
        additionalProperties: z.boolean().optional(),
      })
      .optional(),
  }),
)
const getCustomToolErrorMessage = ({
  toolId,
  integrationNames,
}: {
  toolId: string
  integrationNames?: string[]
}) => {
  const [toolSource, toolName, ...other] = toolId.split('/').map((s) => s.trim())
  if (!toolSource || !toolName || other.length) {
    return `Invalid tool ID: '${toolId}'`
  }

  if (toolSource === 'latitude') {
    const toolName = toolId.slice('latitude:'.length)
    if (toolName === '*' || Object.values(LatitudeTool).includes(toolName as LatitudeTool)) {
      return undefined
    }

    return `There is no Latitude tool with the name '${toolName}'`
  }

  if (integrationNames?.includes(toolSource)) {
    return undefined
  }

  return `Unknown tool source: '${toolSource}'` // TODO: This will include integrations
}

const PROVIDERS_WITH_TOOLS = {
  openai: 'openai',
} as const

export const AI_PROVIDERS_WITH_BUILTIN_TOOLS = Object.keys(PROVIDERS_WITH_TOOLS)

export function buildToolsSchema({ integrationNames }: { integrationNames?: string[] }) {
  const latitudeToolSchema = z.string().refine(
    (toolId) => getCustomToolErrorMessage({ toolId, integrationNames }) === undefined,
    (toolId) => ({
      message: getCustomToolErrorMessage({ toolId, integrationNames }),
    }),
  )
  const providersSchema = z.record(z.literal(PROVIDERS_WITH_TOOLS.openai), openAIToolsList)

  return z.union([
    toolDefinitionObject, // Old schema
    providersSchema,
    z.array(z.union([toolDefinitionObject, latitudeToolSchema, providersSchema])),
  ])
}
