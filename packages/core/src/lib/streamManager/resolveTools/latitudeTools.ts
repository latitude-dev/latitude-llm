import { LatitudeTool } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { StreamManager } from '..'
import { getLatitudeToolInternalName } from '../../../services/latitudeTools/helpers'
import { BadRequestError, LatitudeError, NotFoundError } from '../../errors'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools } from './types'
import { publisher } from '../../../events/publisher'
import { JSONSchema7, Tool } from 'ai'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { findFirstUserInWorkspace } from '../../../data-access/users'
import { simulatedToolDefinition } from '../../../services/simulation/simulateToolResponse'
import { LATITUDE_TOOLS } from '../../../services/latitudeTools/tools'
import z from 'zod'

const SIMULATED_LATITUDE_TOOLS: LatitudeTool[] = [
  LatitudeTool.RunCode,
  LatitudeTool.WebSearch,
  LatitudeTool.WebExtract,
] as const

const resolveAllLatitudeTools = (streamManager: StreamManager) =>
  Object.fromEntries(
    Object.values(LatitudeTool).map((latitudeToolName) => {
      const context = streamManager.$completion!.context
      const internalName = getLatitudeToolInternalName(latitudeToolName)
      const tool = LATITUDE_TOOLS.find((t) => t.name === latitudeToolName)!

      const isSimulated =
        streamManager.simulationSettings?.simulateToolResponses &&
        SIMULATED_LATITUDE_TOOLS.includes(latitudeToolName)

      const definition = instrumentLatitudeTool(tool.definition(context)!, {
        streamManager,
        name: latitudeToolName,
      })

      if (isSimulated) {
        // Redefine "execute" to use the simulated tool definition
        const toolDefinition = tool.definition(context)!
        const inputSchema = z.toJSONSchema(
          toolDefinition.inputSchema as z.ZodType,
        ) as JSONSchema7
        const outputSchema = toolDefinition.outputSchema
          ? (z.toJSONSchema(
              toolDefinition.outputSchema as z.ZodType,
            ) as JSONSchema7)
          : undefined

        definition.execute = simulatedToolDefinition({
          streamManager,
          toolName: internalName,
          toolDescription: tool.definition(context)!.description ?? '',
          inputSchema,
          outputSchema,
        })
      }

      return [
        internalName,
        {
          definition,
          sourceData: {
            source: ToolSource.Latitude,
            latitudeTool: latitudeToolName,
            simulated: isSimulated,
          },
        },
      ]
    }),
  ) satisfies ResolvedTools<ToolSource.Latitude>

export function resolveLatitudeTools({
  config,
  streamManager,
}: {
  config: LatitudePromptConfig
  streamManager: StreamManager
}): TypedResult<ResolvedTools, LatitudeError> {
  const tools = config.tools
  if (!tools) {
    return Result.ok({})
  }

  // Old schema: tools is a { [name: string]: ToolDefinition } object
  if (typeof tools === 'object' && !Array.isArray(tools) && tools !== null) {
    // There are no latitude tools in old schema
    return Result.ok({})
  }

  // New schema
  const toolIds = tools.filter((t) => typeof t === 'string')
  const latitudeToolNames = toolIds // Any other tool ids that are not from "latitude" are computed as Integration Tools
    .map((t) => t.split('/'))
    .filter(([toolSource]) => toolSource === 'latitude')
    .map(([, ...rest]) => rest.join('/'))

  const ALL_RESOLVED_LATITUDE_TOOLS = resolveAllLatitudeTools(streamManager)

  const resolvedTools: ResolvedTools<ToolSource.Latitude> = {}
  for (const latitudeToolName of latitudeToolNames) {
    if (latitudeToolName === '') {
      // 'latitude' was used as the whole toolId, without any '/' separator
      return Result.error(
        new BadRequestError(`You must specify a tool name after 'latitude/'`),
      )
    }

    if (latitudeToolName === '*') {
      Object.assign(resolvedTools, ALL_RESOLVED_LATITUDE_TOOLS)
      continue
    }

    if (
      !Object.values(LatitudeTool).includes(latitudeToolName as LatitudeTool)
    ) {
      return Result.error(
        new NotFoundError(
          `There is no Latitude tool with the name '${latitudeToolName}'`,
        ),
      )
    }

    const internalName = getLatitudeToolInternalName(
      latitudeToolName as LatitudeTool,
    )
    resolvedTools[internalName] = ALL_RESOLVED_LATITUDE_TOOLS[internalName]!
  }

  return Result.ok(resolvedTools)
}

function instrumentLatitudeTool(
  definition: Tool,
  { streamManager, name }: { streamManager: StreamManager; name: string },
) {
  const originalExecute = definition.execute!
  definition.execute = async (...args) => {
    const user = await findFirstUserInWorkspace(streamManager.workspace)

    publisher.publishLater({
      type: 'toolExecuted',
      data: {
        workspaceId: streamManager.workspace.id,
        type: 'latitude',
        toolName: name,
        userEmail: user?.email,
      },
    })

    return originalExecute(...args)
  }

  return definition
}
