import { z } from 'zod'
import { MAX_STEPS_CONFIG_NAME, ParameterType } from '../config'
import { AgentToolsMap, resolveRelativePath } from '../index'
import { azureConfig as azureConfigSchema } from './providers/azure'
import { JSONSchema7 } from 'json-schema'
import { buildToolsSchema } from './toolsSchema'

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

  const LATITUDE_DOC =
    'https://docs.latitude.so/guides/getting-started/providers#using-providers-in-prompts'
  return z.object({
    provider: z
      .string({
        required_error: ``,
        message: `You must select a provider.\nFor example: 'provider: ${providerNames[0] ?? '<your-provider-name>'}'. Read more here: ${LATITUDE_DOC}`,
      })
      .refine((p) => providerNames.includes(p), {
        message: `Provider not available. You must use one of the following:\n${providerNames.map((p) => `'${p}'`).join(', ')}`,
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
          type: z.nativeEnum(ParameterType),
        }),
      )
      .optional(),
    [MAX_STEPS_CONFIG_NAME]: z.number().min(1).max(150).optional(),
    tools: tools.optional(),
    agents: agentsConfigSchema.optional(),
    ...(outputSchema ? { schema: outputSchema } : {}),
    azure: azureConfigSchema.optional(),
  })
}

export const azureConfig = azureConfigSchema
export type { AzureConfig } from './providers/azure'
export { AI_PROVIDERS_WITH_BUILTIN_TOOLS } from './toolsSchema'
export {
  WebSearchToolSchema,
  FileSearchToolSchema,
  ComputerCallSchema,
  openAIToolsList,
  type OpenAIWebSearchTool,
  type OpenAIFilesSearchTool,
} from './providers/openai'
export type { OpenAIToolList } from './providers/openai'
type InferredSchema = z.infer<
  Omit<ReturnType<typeof latitudePromptConfigSchema>, 'schema'>
>
export type LatitudePromptConfig = Omit<InferredSchema, 'schema'> & {
  schema?: JSONSchema7
}
