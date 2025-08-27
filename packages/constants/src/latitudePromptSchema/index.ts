// latitudePromptConfigSchema.ts
import { z } from 'zod'
import { JSONSchema7 } from 'json-schema'
import { MAX_STEPS_CONFIG_NAME, ParameterType } from '../config'
import { AgentToolsMap, resolveRelativePath } from '../index'
import {
  azureConfig as azureConfigSchema,
  type AzureConfig,
} from './providers/azure'
import { buildToolsSchema } from './toolsSchema'
import { zodJsonSchema } from './zodJsonSchema'

// Keep runtime full & strict
const PARAMETER_TYPES = [
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
  ParameterType.Text,
  ParameterType.Image,
  ParameterType.File,
] as const

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
}): z.ZodTypeAny {
  const tools = buildToolsSchema({ integrationNames })
  const outputSchema = noOutputSchemaConfig
    ? z.never({ message: noOutputSchemaConfig?.message }).optional()
    : zodJsonSchema.optional()

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

  const LATITUDE_DOC =
    'https://docs.latitude.so/guides/getting-started/providers#using-providers-in-prompts'

  const latitudePromptConfig = z.object({
    provider: z
      .string({
        required_error: ``,
        message: `You must select a provider.\nFor example: 'provider: ${providerNames[0] ?? '<your-provider-name>'
          }'. Read more here: ${LATITUDE_DOC}`,
      })
      .refine((p) => providerNames.includes(p), {
        message: `Provider not available. You must use one of the following:\n${providerNames
          .map((p) => `'${p}'`)
          .join(', ')}`,
      }),

    model: z.string({
      required_error: `"model" attribute is required. Read more here: ${LATITUDE_DOC}`,
    }),

    temperature: z.number().min(0).max(2).optional(),
    type: z.enum(['agent']).optional(),
    disableAgentOptimization: z.boolean().optional(),

    parameters: z
      .record(
        z.object({
          type: z.enum(PARAMETER_TYPES),
          description: z.string().optional(),
        }),
      )
      .optional(),

    [MAX_STEPS_CONFIG_NAME]: z.number().min(1).max(150).optional(),

    tools: tools.optional(),
    agents: agentsConfigSchema.optional(),

    // ⚠️ keep runtime validation, but don’t `infer` this
    schema: outputSchema,

    azure: azureConfigSchema.optional(),

  }) as unknown as z.ZodType<LatitudePromptConfig>

  return latitudePromptConfig
}

export type { AzureConfig } from './providers/azure'
export {
  WebSearchToolSchema,
  FileSearchToolSchema,
  ComputerCallSchema,
  openAIToolsList,
  type OpenAIWebSearchTool,
  type OpenAIFilesSearchTool,
} from './providers/openai'
export type { OpenAIToolList } from './providers/openai'

// ----------------------------------------------------------
// Types: lightweight & editor-friendly
// ----------------------------------------------------------

/**
 * Use JSONSchema7 for `schema` instead of z.infer<typeof zodJsonSchema>,
 * so TS doesn’t need to resolve the deep recursive type graph.
 */
export type LatitudePromptConfig = {
  provider: string
  model: string
  temperature?: number
  type?: 'agent'
  disableAgentOptimization?: boolean
  parameters?: Record<
    string,
    {
      type:
      | 'array'
      | 'boolean'
      | 'integer'
      | 'null'
      | 'number'
      | 'object'
      | 'string'
      | ParameterType
      description?: string
    }
  >
  [MAX_STEPS_CONFIG_NAME]?: number
  tools?: unknown // keep loose if you don’t need autocomplete
  agents?: string[]
  schema?: JSONSchema7
  azure?: AzureConfig
}
