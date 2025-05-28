import { z } from 'zod'
import { LatitudeTool } from '../config'
import { openAIToolsList } from './providers/openai/index'

const JSON_SCHEMA_TYPES: readonly [string, ...string[]] = [
  'string',
  'number',
  'boolean',
  'object',
  'integer',
  'null',
  'array',
]
const jsonSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum(JSON_SCHEMA_TYPES),
    description: z.string().optional(),

    // object
    properties: z.record(jsonSchema).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.union([z.boolean(), jsonSchema]).optional(),

    // array
    items: z.union([jsonSchema, z.array(jsonSchema)]).optional(),

    // common
    enum: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),

    // string
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    format: z.string().optional(),

    // number
    minimum: z.number().optional(),
    maximum: z.number().optional(),

    $ref: z.string().optional(), // Reference to another schema
  }),
)

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
        properties: z.record(jsonSchema),
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
  const [toolSource, toolName, ...other] = toolId
    .split('/')
    .map((s) => s.trim())
  if (!toolSource || !toolName || other.length) {
    return `Invalid tool ID: '${toolId}'`
  }

  if (toolSource === 'latitude') {
    const toolName = toolId.slice('latitude:'.length)
    if (
      toolName === '*' ||
      Object.values(LatitudeTool).includes(toolName as LatitudeTool)
    ) {
      return undefined
    }

    return `There is no Latitude tool with the name '${toolName}'`
  }

  if (integrationNames && integrationNames.includes(toolSource)) {
    return undefined
  }

  return `Unknown tool source: '${toolSource}'` // TODO: This will include integrations
}

const PROVIDERS_WITH_TOOLS = {
  openai: 'openai',
} as const

export const AI_PROVIDERS_WITH_BUILTIN_TOOLS = Object.keys(PROVIDERS_WITH_TOOLS)

export function buildToolsSchema({
  integrationNames,
}: {
  integrationNames?: string[]
}) {
  const latitudeToolSchema = z.string().refine(
    (toolId) =>
      getCustomToolErrorMessage({ toolId, integrationNames }) === undefined,
    (toolId) => ({
      message: getCustomToolErrorMessage({ toolId, integrationNames }),
    }),
  )
  const providersSchema = z.record(
    z.literal(PROVIDERS_WITH_TOOLS.openai),
    openAIToolsList,
  )

  return z.union([
    toolDefinitionObject, // Old schema
    providersSchema,
    z.array(
      z.union([toolDefinitionObject, latitudeToolSchema, providersSchema]),
    ),
  ])
}
