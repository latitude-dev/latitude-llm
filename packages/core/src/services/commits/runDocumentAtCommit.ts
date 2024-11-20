import { readMetadata } from '@latitude-data/compiler'

import {
  ChainStepResponse,
  Commit,
  ErrorableEntity,
  LogSources,
  StreamType,
  type DocumentVersion,
  type Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import { generateUUIDIdentifier, hashContent, Result } from '../../lib'
import { runChain } from '../chains/run'
import { createDocumentLog } from '../documentLogs'
import { getReferenceFn } from '../documents/getReferenceFn'
import { buildProvidersMap } from '../providerApiKeys/buildMap'
import { RunDocumentChecker } from './RunDocumentChecker'

export async function createDocumentRunResult({
  workspace,
  document,
  commit,
  errorableUuid,
  parameters,
  contentHash,
  customIdentifier,
  publishEvent,
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
  contentHash: string
  publishEvent: boolean
  customIdentifier?: string
  duration?: number
  response?: ChainStepResponse<StreamType>
}) {
  const durantionInMs = duration ?? 0
  if (publishEvent) {
    publisher.publishLater({
      type: 'documentRun',
      data: {
        workspaceId: workspace.id,
        projectId: commit.projectId,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        documentLogUuid: errorableUuid,
        response,
        contentHash,
        parameters,
        duration: durantionInMs,
        source,
      },
    })
  }

  return await createDocumentLog({
    commit,
    data: {
      documentUuid: document.documentUuid,
      customIdentifier,
      duration: durantionInMs,
      originalPrompt: document.content,
      parameters,
      contentHash,
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
  customIdentifier,
  source,
}: {
  workspace: Workspace
  document: DocumentVersion
  parameters: Record<string, unknown>
  commit: Commit
  customIdentifier?: string
  source: LogSources
}) {
  const errorableType = ErrorableEntity.DocumentLog
  const errorableUuid = generateUUIDIdentifier()
  const providersMap = await buildProvidersMap({
    workspaceId: workspace.id,
  })
  const referenceFnResult = await getReferenceFn({
    workspaceId: workspace.id,
    commit,
  })

  if (referenceFnResult.error) return referenceFnResult

  const metadata = await readMetadata({
    prompt: document.content,
    fullPath: document.path,
    referenceFn: referenceFnResult.unwrap(),
  })

  const checker = new RunDocumentChecker({
    document,
    errorableUuid,
    prompt: document.content,
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
      contentHash: hashContent(metadata.resolvedPrompt),
      source,
      publishEvent: false,
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

  return Result.ok({
    stream: run.stream,
    duration: run.duration,
    errorableUuid,
    response: run.response.then(async (response) => {
      await createDocumentRunResult({
        workspace,
        document,
        commit,
        errorableUuid,
        parameters,
        contentHash: document.contentHash ?? hashContent(document.content),
        customIdentifier,
        source,
        response: response.value,
        duration: await run.duration,
        publishEvent: !response.error,
      })

      return response
    }),
  })
}
