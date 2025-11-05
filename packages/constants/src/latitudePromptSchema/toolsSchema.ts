import { z } from 'zod'
import { LatitudeTool } from '../config'
import { openAIToolsListSchema } from './providers/openai/index'
import { zodJsonSchema } from './zodJsonSchema'

const toolDefinitionObject = z.record(
  z.string(),
  z.object({
    description: z.string({
      error: (issue) =>
        issue.input === undefined
          ? 'You must provide a description for the tool'
          : 'Invalid description value',
    }),
    parameters: z
      .object({
        type: z.literal('object', {
          error: (issue) =>
            issue.input === undefined
              ? 'Parameters must be an object'
              : 'Parameters must be an object',
        }),
        properties: z.record(z.string(), zodJsonSchema),
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

export const providersSchema = z.record(
  z.literal(PROVIDERS_WITH_TOOLS.openai),
  openAIToolsListSchema,
)
export type ProvidersSchema = z.infer<typeof providersSchema>

export function buildToolsSchema({
  integrationNames,
}: {
  integrationNames?: string[]
}) {
  const latitudeToolSchema = z
    .string()
    .refine(
      (toolId: string) =>
        getCustomToolErrorMessage({ toolId, integrationNames }) === undefined,
      {
        error: (issue) =>
          getCustomToolErrorMessage({
            toolId: issue.input as string,
            integrationNames,
          }),
      },
    )

  return z.union([
    toolDefinitionObject, // Old schema
    providersSchema,
    z.array(
      z.union([toolDefinitionObject, latitudeToolSchema, providersSchema]),
    ),
  ])
}
