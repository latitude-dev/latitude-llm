import { z } from 'zod'
import {
  LATITUDE_TOOLS_CONFIG_NAME,
  LatitudeTool,
  MAX_STEPS_CONFIG_NAME,
  ParameterType,
} from '../config'
import { AgentToolsMap, resolveRelativePath } from '../index'
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

export function latitudePromptConfigSchema({
  providerNames,
  integrationNames,
  fullPath,
  agentToolsMap,
  noOutputSchemaConfig,
}: {
  providerNames: string[]
  integrationNames?: string[]
  fullPath?: string
  agentToolsMap?: AgentToolsMap
  noOutputSchemaConfig?: { message: string }
}) {
  const outputSchema = noOutputSchemaConfig
    ? z.never({ message: noOutputSchemaConfig?.message }).optional()
    : undefined

  const agentsConfigSchema =
    fullPath && agentToolsMap
      ? z.array(
          z.string().refine(
            (relativeAgentPath) => {
              const fullAgentPath = resolveRelativePath(
                relativeAgentPath,
                fullPath,
              )

              return Object.values(agentToolsMap).includes(fullAgentPath)
            },
            {
              message: 'This document does not exist or is not an agent',
            },
          ),
        )
      : z.never({ message: 'Subagents are not allowed in this context ' })

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
  const getCustomToolErrorMessage = (toolId: string) => {
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

  const latitudeToolSchema = z.string().refine(
    (toolId) => getCustomToolErrorMessage(toolId) === undefined,
    (toolId) => ({ message: getCustomToolErrorMessage(toolId) }),
  )
  const providersSchema = z.record(z.literal('openai'), openAIToolsList)
  const toolDefinitionSchema = z.union([
    toolDefinitionObject, // Old schema
    providersSchema,
    z.array(
      z.union([toolDefinitionObject, latitudeToolSchema, providersSchema]),
    ),
  ])

  return z.object({
    provider: z
      .string({
        required_error: `You must select a provider.\nFor example: 'provider: ${providerNames[0] ?? '<your-provider-name>'}'`,
      })
      .refine((p) => providerNames.includes(p), {
        message: `Provider not available. You must use one of the following:\n${providerNames.map((p) => `'${p}'`).join(', ')}`,
      }),
    model: z.string({
      required_error: `You must select the model.\nFor example: 'model: 'gpt-4o'`,
    }),
    temperature: z.number().min(0).max(2).optional(),
    type: z.enum(['agent']).optional(),
    parameters: z
      .record(
        z.object({
          type: z.nativeEnum(ParameterType),
        }),
      )
      .optional(),
    [MAX_STEPS_CONFIG_NAME]: z.number().min(1).max(150).optional(),
    tools: toolDefinitionSchema.optional(),
    [LATITUDE_TOOLS_CONFIG_NAME]: z
      .array(z.nativeEnum(LatitudeTool))
      .optional(),
    agents: agentsConfigSchema.optional(),
    ...(outputSchema ? { schema: outputSchema } : {}),

    // Provider specific config
    // These schemas are not values valid directly on the providers but a way
    // to validate specific config we want to allow from this providers that later is
    // transformed into valid config sent to the providers or returned to the users in case
    // of using Latitude through the SDK without the gateway.
  })
}
