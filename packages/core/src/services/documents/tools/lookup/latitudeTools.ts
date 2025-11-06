import { LatitudeTool } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ToolManifestDict } from '@latitude-data/constants/tools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { LATITUDE_TOOLS } from '../../../latitudeTools/tools'
import { getLatitudeToolInternalName } from '../../../latitudeTools/helpers'
import { Result, TypedResult } from '../../../../lib/Result'
import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '@latitude-data/constants/errors'

const lookupAllLatitudeTools = () =>
  Object.fromEntries(
    Object.values(LatitudeTool).map((latitudeToolName) => {
      const internalName = getLatitudeToolInternalName(latitudeToolName)
      const tool = LATITUDE_TOOLS.find((t) => t.name === latitudeToolName)!
      const { description, inputSchema, outputSchema } = tool.definition()

      return [
        internalName,
        {
          definition: {
            description,
            inputSchema,
            outputSchema,
          },
          sourceData: {
            source: ToolSource.Latitude,
            latitudeTool: latitudeToolName,
          },
        },
      ]
    }),
  ) satisfies ToolManifestDict<ToolSource.Latitude>

export function lookupLatitudeTools({
  config,
}: {
  config: Pick<LatitudePromptConfig, 'tools'>
}): TypedResult<ToolManifestDict<ToolSource.Latitude>, LatitudeError> {
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

  const ALL_LOOKUPED_LATITUDE_TOOLS = lookupAllLatitudeTools()

  const lookedUpTools: ToolManifestDict<ToolSource.Latitude> = {}
  for (const latitudeToolName of latitudeToolNames) {
    if (latitudeToolName === '') {
      // 'latitude' was used as the whole toolId, without any '/' separator
      return Result.error(
        new BadRequestError(`You must specify a tool name after 'latitude/'`),
      )
    }

    if (latitudeToolName === '*') {
      Object.assign(lookedUpTools, ALL_LOOKUPED_LATITUDE_TOOLS)
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
    lookedUpTools[internalName] = ALL_LOOKUPED_LATITUDE_TOOLS[internalName]!
  }

  return Result.ok(lookedUpTools)
}
