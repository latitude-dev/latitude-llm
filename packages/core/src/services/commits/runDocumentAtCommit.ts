import { type Commit } from '../../schema/models/types/Commit'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { LogSources } from '../../constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import {
  type LatitudeTelemetry,
  telemetry as realTelemetry,
  TelemetryContext,
} from '../../telemetry'
import { runChain } from '../chains/run'
import { createDocumentLog } from '../documentLogs/create'
import { getResolvedContent } from '../documents'
import { isErrorRetryable } from '../evaluationsV2/run'
import { buildProvidersMap } from '../providerApiKeys/buildMap'
import { RunDocumentChecker } from './RunDocumentChecker'
import type { SimulationSettings } from '@latitude-data/constants/simulation'
import { ToolHandler } from '../documents/tools/clientTools/handlers'

export type RunDocumentAtCommitArgs = {
  context: TelemetryContext
  workspace: WorkspaceDto
  commit: Commit
  document: DocumentVersion
  parameters: Record<string, unknown>
  customIdentifier?: string
  source: LogSources
  tools?: Record<string, ToolHandler>
  customPrompt?: string
  experiment?: Experiment
  errorableUuid?: string
  userMessage?: string
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
    abortSignal,
    tools = {},
    simulationSettings,
    testDeploymentId,
  }: RunDocumentAtCommitArgs,
  telemetry: LatitudeTelemetry = realTelemetry,
) {
  errorableUuid = errorableUuid ?? generateUUIDIdentifier()
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const result = await getResolvedContent({
    document,
    commit,
    customPrompt,
  })
  if (result.error) return result

  const $prompt = telemetry.prompt(context, {
    documentLogUuid: errorableUuid,
    experimentUuid: experiment?.uuid,
    testDeploymentId,
    externalId: customIdentifier,
    name: document.path.split('/').at(-1),
    parameters: parameters,
    promptUuid: document.documentUuid,
    template: result.value,
    versionUuid: commit.uuid,
    projectId: commit.projectId,
    source,
  })

  const checker = new RunDocumentChecker({
    document,
    errorableUuid,
    prompt: result.value,
    parameters,
    userMessage,
  })
  const checkerResult = await checker.call()
  if (checkerResult.error) {
    await createDocumentLog({
      commit,
      data: {
        documentUuid: document.documentUuid,
        customIdentifier,
        duration: 0,
        parameters,
        resolvedContent: result.value,
        uuid: errorableUuid,
        source,
        experimentId: experiment?.id,
      },
    }).then((r) => r.unwrap())

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
    promptSource: {
      document,
      commit,
    },
    simulationSettings,
  })

  return Result.ok({
    ...runResult,
    errorableUuid,
    resolvedContent: result.value,
    lastResponse: runResult.response.then(async (response) => {
      const error = await runResult.error
      if (error) {
        $prompt.fail(error)

        if (isErrorRetryable(error)) return response
      } else {
        $prompt.end()
      }

      const duration = await runResult.duration
      await createDocumentLog({
        commit,
        data: {
          customIdentifier,
          documentUuid: document.documentUuid,
          duration: duration ?? 0,
          experimentId: experiment?.id,
          parameters,
          resolvedContent: result.value,
          source,
          uuid: errorableUuid,
        },
      }).then((r) => r.unwrap())

      return response
    }),
  })
}
