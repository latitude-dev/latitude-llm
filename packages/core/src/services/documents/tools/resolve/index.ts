import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import { LatitudeError } from '../../../../lib/errors'
import {
  ResolvedTool,
  ResolvedToolsDict,
  ToolManifest,
  ToolManifestDict,
} from '@latitude-data/constants/tools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { StreamManager } from '../../../../lib/streamManager'
import { Tool } from 'ai'
import { simulatedToolDefinition } from '../../../simulation/simulateToolResponse'
import { resolveClientToolDefinition } from './clientTools'
import { resolveLatitudeToolDefinition } from './latitudeTools'
import { resolveAgentAsToolDefinition } from './agentsAsTools'
import { resolveIntegrationToolDefinition } from './integrationTools'
import { resolveProviderToolDefinition } from './providerTools'

export async function resolveToolDefinition({
  toolName,
  toolManifest,
  streamManager,
  isSimulated,
}: {
  toolName: string
  toolManifest: ToolManifest
  streamManager: StreamManager
  isSimulated: boolean
}): PromisedResult<Tool, LatitudeError> {
  if (toolManifest.sourceData.source === ToolSource.Agent) {
    // Subagents is the only tool that will never be simulated
    return resolveAgentAsToolDefinition({
      toolName,
      toolManifest,
      streamManager,
    })
  }

  // If simulated, return a simulated tool definition
  if (isSimulated) {
    return Result.ok(
      simulatedToolDefinition({
        streamManager,
        toolName,
        toolManifest,
      }),
    )
  }

  switch (toolManifest.sourceData.source) {
    case ToolSource.Client:
      return resolveClientToolDefinition({
        toolName,
        toolManifest,
        streamManager,
      })
    case ToolSource.Latitude:
      return resolveLatitudeToolDefinition({
        toolName,
        toolManifest,
        streamManager,
      })
    case ToolSource.Integration:
      return resolveIntegrationToolDefinition({
        toolName,
        toolManifest,
        streamManager,
      })
    case ToolSource.ProviderTool:
      return resolveProviderToolDefinition({
        toolName,
        toolManifest,
        streamManager,
      })
    default:
      return Result.error(
        new LatitudeError(
          `Tool source '${toolManifest.sourceData.source}' not supported`,
        ),
      )
  }
}

export async function resolveTools({
  toolManifestDict,
  streamManager,
}: {
  toolManifestDict: ToolManifestDict
  streamManager: StreamManager
}): PromisedResult<ResolvedToolsDict, LatitudeError> {
  const resolvedToolsDict: ResolvedToolsDict = {}
  for (const [toolName, toolManifest] of Object.entries(toolManifestDict)) {
    const isSimulated =
      streamManager.simulationSettings?.simulateToolResponses ?? false

    const resolvedToolDefinitionResult = await resolveToolDefinition({
      toolName,
      toolManifest,
      streamManager,
      isSimulated,
    })
    if (resolvedToolDefinitionResult.error) return resolvedToolDefinitionResult
    const definition = resolvedToolDefinitionResult.unwrap()

    resolvedToolsDict[toolName] = {
      definition,
      sourceData: {
        ...toolManifest.sourceData,
        simulated: isSimulated,
      },
    } as ResolvedTool
  }

  return Result.ok(resolvedToolsDict)
}
