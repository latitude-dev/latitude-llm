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

export function createRelativePath(refPath: string, from?: string): string {
  if (!from) {
    return '/' + refPath
  }

  const refSegments = refPath.split('/')
  const currentSegments = from.split('/').slice(0, -1)

  const commonSegments = []
  for (let i = 0; i < refSegments.length && i < currentSegments.length; i++) {
    if (refSegments[i] !== currentSegments[i]) {
      break
    }

    commonSegments.push(refSegments[i])
  }

  const upSegments = currentSegments
    .slice(commonSegments.length)
    .map(() => '..')
  const downSegments = refSegments.slice(commonSegments.length)

  const fullRefPath = [...upSegments, ...downSegments].join('/')

  return refPath.length < fullRefPath.length ? '/' + refPath : fullRefPath
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

    return `Unknown tool source: '${toolSource}'` // TODO: This will include integrations
  }

  const customToolSchema = z.string().refine(
    (toolId) => getCustomToolErrorMessage(toolId) === undefined,
    (toolId) => ({ message: getCustomToolErrorMessage(toolId) }),
  )
  const toolDefinitionSchema = z.union([
    toolDefinitionObject, // Old schema
    z.array(z.union([toolDefinitionObject, customToolSchema])), // New schema
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
