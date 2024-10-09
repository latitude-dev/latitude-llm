import {
  Commit,
  ErrorableEntity,
  LogSources,
  StreamType,
  type DocumentVersion,
  type Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import { generateUUIDIdentifier, Result } from '../../lib'
import { ChainResponse, runChain } from '../chains/run'
import { createDocumentLog } from '../documentLogs'
import { getResolvedContent } from '../documents'
import { buildProvidersMap } from '../providerApiKeys/buildMap'
import { RunDocumentChecker } from './RunDocumentChecker'

export async function createDocumentRunResult({
  workspace,
  document,
  commit,
  errorableUuid,
  parameters,
  resolvedContent,
  source,
  response,
  duration,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  source: LogSources
  errorableUuid: string
  parameters: Record<string, unknown>
  resolvedContent: string
  customIdentifier?: string
  duration?: number
  response?: ChainResponse<StreamType>
}) {
  const durantionInMs = duration ?? 0
  publisher.publishLater({
    type: 'documentRun',
    data: {
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      documentLogUuid: errorableUuid,
      response,
      resolvedContent,
      parameters,
      duration: durantionInMs,
      source,
    },
  })

  await createDocumentLog({
    commit,
    data: {
      documentUuid: document.documentUuid,
      duration: durantionInMs,
      parameters,
      resolvedContent,
      uuid: errorableUuid,
      source,
    },
  }).then((r) => r.unwrap())
}

export async function runDocumentAtCommit({
  workspace,
  document,
  parameters,
  commit,
  source,
}: {
  workspace: Workspace
  document: DocumentVersion
  parameters: Record<string, unknown>
  commit: Commit
  source: LogSources
}) {
  const errorableType = ErrorableEntity.EvaluationResult
  const errorableUuid = generateUUIDIdentifier()
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const result = await getResolvedContent({
    workspaceId: workspace.id,
    document,
    commit,
  })

  // NOTE: We don't log these errors. If something happen
  // in getResolvedContent it will not appear in Latitude
  if (result.error) return result

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
    })
    return checkerResult
  }

  const run = await runChain({
    generateUUID: () => errorableUuid,
    errorableType,
    workspace,
    chain: checkerResult.value.chain,
    providersMap,
    source,
  })

  const duration = await run.duration
  const response = await run.response
  await createDocumentRunResult({
    workspace,
    document,
    commit,
    errorableUuid,
    parameters,
    resolvedContent: result.value,
    source,
    response,
    duration,
  })

  return Result.ok(run)
}
