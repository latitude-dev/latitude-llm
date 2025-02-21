import { z } from 'zod'
import { AgentToolsMap } from '.'
import {
  LATITUDE_TOOLS_CONFIG_NAME,
  LatitudeTool,
  MAX_STEPS_CONFIG_NAME,
  ParameterType,
} from './config'

export function resolveRelativePath(refPath: string, from?: string): string {
  if (refPath.startsWith('/')) {
    return refPath.slice(1)
  }

  if (!from) {
    return refPath
  }

  const fromDir = from.split('/').slice(0, -1).join('/')

  const segments = refPath.split('/')
  const resultSegments = fromDir ? fromDir.split('/') : []

  for (const segment of segments) {
    if (segment === '..') {
      resultSegments.pop()
    } else if (segment !== '.') {
      resultSegments.push(segment)
    }
  }

  return resultSegments.join('/')
}

export function promptConfigSchema({
  providerNames,
  fullPath,
  agentToolsMap,
}: {
  providerNames: string[]
  fullPath?: string
  agentToolsMap?: AgentToolsMap
}) {
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

  const toolDefinitionSchema = z.object({
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
  })

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
    tools: z.record(toolDefinitionSchema).optional(),
    [LATITUDE_TOOLS_CONFIG_NAME]: z
      .array(z.nativeEnum(LatitudeTool))
      .optional(),
    agents: agentsConfigSchema.optional(),
  })
}

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
