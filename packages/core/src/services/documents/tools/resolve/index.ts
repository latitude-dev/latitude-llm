import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import { LatitudeError } from '../../../../lib/errors'
import {
  ResolvedTool,
  ResolvedToolsDict,
  ToolManifest,
  ToolManifestDict,
} from '@latitude-data/constants/tools'
import {
  ToolSource,
  ToolSourceData,
} from '@latitude-data/constants/toolSources'
import { StreamManager } from '../../../../lib/streamManager'
import { Tool } from 'ai'
import { simulatedToolDefinition } from '../../../simulation/simulateToolResponse'
import { resolveClientToolDefinition } from './clientTools'
import { resolveLatitudeToolDefinition } from './latitudeTools'
import { resolveAgentAsToolDefinition } from './agentsAsTools'
import { resolveIntegrationToolDefinition } from './integrationTools'
import { resolveProviderToolDefinition } from './providerTools'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import {
  LogSources,
  NOT_SIMULATABLE_LATITUDE_TOOLS,
} from '@latitude-data/constants'

function isToolSimulated({
  toolName,
  toolManifest,
  simulationSettings,
  logSource,
}: {
  toolName: string
  toolManifest: ToolManifest
  simulationSettings?: SimulationSettings
  logSource: LogSources
}): boolean {
  const toolSource = toolManifest.sourceData.source
  if (toolSource === ToolSource.Agent) {
    // Subagents are never simulated
    return false
  }

  if (toolSource === ToolSource.Client && logSource === LogSources.Experiment) {
    // Client tools are always simulated in experiments
    return true
  }

  if (toolSource === ToolSource.Latitude) {
    const latitudeTool = (
      toolManifest.sourceData as ToolSourceData<ToolSource.Latitude>
    ).latitudeTool

    if (NOT_SIMULATABLE_LATITUDE_TOOLS.includes(latitudeTool)) {
      // Some latitude tools cannot be simulated
      return false
    }
  }

  if (!simulationSettings) return false
  if (!simulationSettings.simulateToolResponses) return false

  if (!simulationSettings.simulatedTools?.length) {
    // If no explicit list of tools is defined, simulate all tools
    return true
  }

  return simulationSettings.simulatedTools.includes(toolName)
}

async function resolveToolDefinition({
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
  // If simulated, return a simulated tool definition
  if (isSimulated) {
    return Result.ok(
      simulatedToolDefinition({
        context: streamManager.$completion!.context,
        toolName,
        toolManifest,
        simulationInstructions:
          streamManager.simulationSettings?.toolSimulationInstructions,
      }),
    )
  }

  switch (toolManifest.sourceData.source) {
    case ToolSource.Agent:
      return resolveAgentAsToolDefinition({
        toolName,
        toolManifest,
        streamManager,
      })
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
    const isSimulated = isToolSimulated({
      toolName,
      toolManifest,
      simulationSettings: streamManager.simulationSettings,
      logSource: streamManager.source,
    })

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
