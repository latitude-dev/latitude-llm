import type { Message } from '@latitude-data/constants'
import type { SimulationSettings } from '@latitude-data/constants/simulation'
import { LogSources } from '../../constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { isRetryableError } from '../../lib/isRetryableError'
import { Result } from '../../lib/Result'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Experiment } from '../../schema/models/types/Experiment'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import {
  type LatitudeTelemetry,
  telemetry as realTelemetry,
  TelemetryContext,
} from '../../telemetry'
import { runChain } from '../chains/run'
import { getResolvedContent } from '../documents'
import { ToolHandler } from '../documents/tools/clientTools/handlers'
import { buildProvidersMap } from '../providerApiKeys/buildMap'
import { RunDocumentChecker } from './RunDocumentChecker'

export type RunDocumentAtCommitArgs = {
  context: TelemetryContext
  workspace: WorkspaceDto
  commit: Commit
  document: DocumentVersion
  parameters: Record<string, unknown>
  customIdentifier?: string
  source: LogSources
  tools?: Record<string, ToolHandler>
  mcpHeaders?: Record<string, Record<string, string>>
  customPrompt?: string
  experiment?: Experiment
  errorableUuid?: string
  userMessage?: string
  messages?: Message[]
  abortSignal?: AbortSignal
  simulationSettings?: SimulationSettings
  testDeploymentId?: number
}

export async function runDocumentAtCommit(
  {
    context,
    workspace,
    document,
    parameters,
    commit,
    customIdentifier,
    source,
    customPrompt,
    experiment,
    errorableUuid,
    userMessage,
    messages,
    abortSignal,
    tools = {},
    mcpHeaders,
    simulationSettings,
    testDeploymentId,
  }: RunDocumentAtCommitArgs,
  telemetry: LatitudeTelemetry = realTelemetry,
) {
  errorableUuid = errorableUuid ?? generateUUIDIdentifier()

  // Set trace-level attributes in baggage so all child spans inherit them
  const attributes: Record<string, string> = {
    'latitude.documentLogUuid': errorableUuid,
    'latitude.documentUuid': document.documentUuid,
    'latitude.commitUuid': commit.uuid,
    'latitude.projectId': String(commit.projectId),
  }
  if (experiment?.uuid) {
    attributes['latitude.experimentUuid'] = experiment.uuid
  }
  if (testDeploymentId) {
    attributes['latitude.testDeploymentId'] = String(testDeploymentId)
  }
  if (source) {
    attributes['latitude.source'] = source
  }
  if (customIdentifier) {
    attributes['latitude.customIdentifier'] = customIdentifier
  }
  const ctxWithAttributes = telemetry.context.setAttributes(context, attributes)

  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const result = await getResolvedContent({
    document,
    commit,
    customPrompt,
  })
  if (result.error) return result

  const $prompt = telemetry.span.prompt(
    {
      name: document.path.split('/').at(-1),
      parameters: parameters,
      template: result.value,
    },
    ctxWithAttributes,
  )

  const checker = new RunDocumentChecker({
    document,
    errorableUuid,
    prompt: result.value,
    parameters,
    userMessage,
  })
  const checkerResult = await checker.call()
  if (checkerResult.error) {
    $prompt.fail(checkerResult.error)
    return checkerResult
  }

  const { chain } = checkerResult.value

  const runResult = runChain({
    context: $prompt.context,
    abortSignal,
    providersMap,
    source,
    workspace,
    chain,
    uuid: errorableUuid,
    tools,
    mcpHeaders,
    promptSource: {
      document,
      commit,
    },
    simulationSettings,
    appendMessages: messages,
  })

  return Result.ok({
    ...runResult,
    errorableUuid,
    resolvedContent: result.value,
    lastResponse: runResult.response.then(async (response) => {
      const error = await runResult.error
      if (error) {
        $prompt.fail(error)

        if (isRetryableError(error)) return response
      } else {
        $prompt.end()
      }

      return response
    }),
  })
}
