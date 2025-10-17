import { LogSources, ToolDefinition } from '@latitude-data/constants'
import { BACKGROUND, TelemetryContext } from '../../../../telemetry'
import { getCopilotDataForGenerateToolResponses } from './getCopilotData'
import {
  getDataForInitialRequest,
  GetDataParams,
} from './getDataForInitialRequest'
import { scan } from 'promptl-ai'
import { type Experiment } from '../../../../schema/models/types/Experiment'
import { runDocumentAtCommit } from '../../../../services/commits'
import { isOldToolsSchema } from '../../../../lib/streamManager/resolveTools/clientTools'
import {
  mockClientToolResult,
  ToolHandler,
} from '../../../../lib/streamManager/clientTools/handlers'

export async function runDocumentAtCommitWithAutoToolResponses({
  parameters,
  customPrompt,
  source,
  experiment,
  context,
  ...dataParams
}: GetDataParams & {
  parameters: Record<string, unknown>
  customPrompt?: string
  experiment?: Experiment
  source: LogSources
  context?: TelemetryContext
}) {
  const copilotResult = await getCopilotDataForGenerateToolResponses()
  if (copilotResult.error) return copilotResult

  const dataResult = await getDataForInitialRequest(dataParams)
  if (dataResult.error) return dataResult

  const { workspace, document, commit } = dataResult.value

  return runDocumentAtCommit({
    context: context ?? BACKGROUND({ workspaceId: workspace.id }),
    workspace,
    document,
    parameters,
    commit,
    source,
    customPrompt,
    experiment,
    tools: await mockClientToolHandlers(customPrompt ?? document.content),
  })
}

export type RunDocumentAtCommitWithAutoToolResponsesFn =
  typeof runDocumentAtCommitWithAutoToolResponses

async function mockClientToolHandlers(
  prompt: string,
): Promise<Record<string, ToolHandler>> {
  const { config } = await scan({ prompt })
  if (!config.tools) return {}

  let tools: Record<string, ToolDefinition>
  if (
    isOldToolsSchema(
      config.tools as Record<string, ToolDefinition> | ToolDefinition[],
    )
  ) {
    tools = config.tools as Record<string, ToolDefinition>
  } else {
    tools = Object.assign({}, config.tools)
  }

  return Object.entries(tools).reduce(
    (acc, [name]) => {
      acc[name] = mockClientToolResult
      return acc
    },
    {} as Record<string, ToolHandler>,
  )
}
