import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import {
  ChainStepResponse,
  Commit,
  DocumentType,
  ErrorableEntity,
  Experiment,
  LogSources,
  StreamType,
  type DocumentVersion,
  type Workspace,
} from '../../browser'
import { telemetry, TelemetryContext } from '../../telemetry'
import { runAgent } from '../agents/run'
import { runChain } from '../chains/run'
import { createDocumentLog } from '../documentLogs/create'
import { getResolvedContent } from '../documents'
import { isErrorRetryable } from '../evaluationsV2/run'
import { buildProvidersMap } from '../providerApiKeys/buildMap'
import { generateUUIDIdentifier } from './../../lib/generateUUID'
import { Result } from './../../lib/Result'
import { RunDocumentChecker } from './RunDocumentChecker'

async function createDocumentRunResult({
  document,
  commit,
  errorableUuid,
  experiment,
  parameters,
  resolvedContent,
  customIdentifier,
  source,
  duration,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  source: LogSources
  errorableUuid: string
  experiment?: Experiment
  parameters: Record<string, unknown>
  resolvedContent: string
  publishEvent: boolean
  customIdentifier?: string
  duration?: number
  response?: ChainStepResponse<StreamType>
}) {
  const durantionInMs = duration ?? 0

  return await createDocumentLog({
    commit,
    data: {
      documentUuid: document.documentUuid,
      customIdentifier,
      duration: durantionInMs,
      parameters,
      resolvedContent,
      uuid: errorableUuid,
      source,
      experimentId: experiment?.id,
    },
  }).then((r) => r.unwrap())
}

export async function runDocumentAtCommit({
  context,
  workspace,
  document,
  parameters,
  commit,
  customIdentifier,
  source,
  abortSignal,
  customPrompt,
  experiment,
  errorableUuid,
}: {
  context: TelemetryContext
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  parameters: Record<string, unknown>
  customIdentifier?: string
  source: LogSources
  abortSignal?: AbortSignal
  customPrompt?: string
  experiment?: Experiment
  errorableUuid?: string
}) {
  const errorableType = ErrorableEntity.DocumentLog
  errorableUuid = errorableUuid ?? generateUUIDIdentifier()
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const result = await getResolvedContent({
    workspaceId: workspace.id,
    document,
    commit,
    customPrompt,
  })

  // NOTE: We don't log these errors. If something happen
  // in getResolvedContent it will not appear in Latitude
  if (result.error) return result

  // Note: run document retries always produce new traces
  const $prompt = telemetry.prompt(context, {
    logUuid: errorableUuid,
    versionUuid: commit.uuid,
    promptUuid: document.documentUuid,
    experimentUuid: experiment?.uuid,
    externalId: customIdentifier,
    template: result.value,
    parameters: parameters,
    _internal: { source },
  })

  const checker = new RunDocumentChecker({
    document,
    errorableUuid,
    prompt: result.value,
    parameters,
  })
  const checkerResult = await checker.call()

  if (checkerResult.error) {
    await createDocumentRunResult({
      workspace,
      document,
      commit,
      errorableUuid,
      parameters,
      resolvedContent: result.value,
      source,
      publishEvent: false,
      experiment,
    })
    $prompt.fail(checkerResult.error)
    return checkerResult
  }

  const runArgs = {
    context: $prompt.context,
    abortSignal,
    generateUUID: () => errorableUuid,
    errorableType,
    workspace,
    chain: checkerResult.value.chain,
    isChain: checkerResult.value.isChain,
    globalConfig: checkerResult.value.config as LatitudePromptConfig,
    promptlVersion: document.promptlVersion,
    providersMap,
    source,
    promptSource: {
      document,
      commit,
    },
  }

  const runFn =
    document.documentType === DocumentType.Agent ? runAgent : runChain
  const runResult = runFn(runArgs)

  return Result.ok({
    ...runResult,
    resolvedContent: result.value,
    errorableUuid,
    lastResponse: runResult.lastResponse
      .then(async (response) => {
        const error = await runResult.error
        if (error) {
          $prompt.fail(error)
          if (isErrorRetryable(error)) return response
        } else {
          $prompt.end()
        }

        await createDocumentRunResult({
          workspace,
          document,
          commit,
          errorableUuid,
          parameters,
          resolvedContent: result.value,
          customIdentifier,
          source,
          duration: await runResult.duration,
          publishEvent: true,
          experiment,
        })

        return response
      })
      .catch((error) => {
        $prompt.fail(error)
      }),
  })
}
