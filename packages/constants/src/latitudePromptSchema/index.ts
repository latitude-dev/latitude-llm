import { JSONSchema7, JSONSchema7TypeName } from 'json-schema'
import { z } from 'zod'
import { MAX_STEPS_CONFIG_NAME, ParameterType } from '../config'
import { AgentToolsMap, resolveRelativePath } from '../index'
import { azureConfig as azureConfigSchema } from './providers/azure'
import { buildToolsSchema } from './toolsSchema'
import { zodJsonSchema } from './zodJsonSchema'

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
] as const satisfies readonly (JSONSchema7TypeName | ParameterType)[]

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
  return z
    .object({
      provider: z
        .string({
          required_error: '',
          message: `You must select a provider.\nFor example: 'provider: ${providerNames[0] ?? '<your-provider-name>'}'. Read more here: ${LATITUDE_DOC}`,
        })
        .refine((p) => providerNames.includes(p), {
          message: `Provider not available. You must use one of the following:\n${providerNames.map((p) => `'${p}'`).join(', ')}`,
        }),
      model: z.string({
        required_error: `The model attribute is required. Read more here: ${LATITUDE_DOC}`,
      }),
      temperature: z.number().min(0).max(2).optional(),
      type: z.enum(['agent']).optional(),
      name: z
        .string()
        .max(64, 'Name must be at most 64 characters')
        .min(1, 'Name cannot be empty')
        .regex(
          /^[A-Za-z_][A-Za-z0-9_]*$/,
          'Name cannot contain spaces, special characters, or start with a number',
        )
        .optional(),
      description: z.string().min(1, 'Description cannot be empty').optional(),

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
      subagents: z
        .any()
        .refine(() => false, {
          message:
            'Subagents attribute does not exist. Use agents attribute instead',
        })
        .optional(),
      schema: outputSchema,
      azure: azureConfigSchema.optional(),
    })

    .refine((d) => d.type === 'agent' || !d.name, {
      // name is provided but type is not agent
      path: ['name'],
      message: 'The "name" field can only be used when type is set to "agent"',
    })
    .refine((d) => d.type === 'agent' || !d.description, {
      // description is provided but type is not agent
      path: ['description'],
      message:
        'The "description" field can only be used when type is set to "agent"',
    })
}

export const azureConfig = azureConfigSchema
export type { AzureConfig } from './providers/azure'
export {
  ComputerCallSchema,
  FileSearchToolSchema,
  openAIToolsList,
  WebSearchToolSchema,
  type OpenAIFilesSearchTool,
  type OpenAIWebSearchTool,
} from './providers/openai'
export type { OpenAIToolList } from './providers/openai'
export { AI_PROVIDERS_WITH_BUILTIN_TOOLS } from './toolsSchema'
type InferredSchema = z.infer<
  Omit<ReturnType<typeof latitudePromptConfigSchema>, 'schema'>
>
export type LatitudePromptConfig = Omit<InferredSchema, 'schema'> & {
  schema?: JSONSchema7
}
