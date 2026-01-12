import { LogSources } from '@latitude-data/constants'
import { LatitudeError } from '../../lib/errors'
import { BACKGROUND } from '../../telemetry'
import { buildClientToolHandlersMap } from '../documents/tools/clientTools/handlers'
import { runDocumentAtCommit } from './runDocumentAtCommit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { WorkspaceDto } from '../../schema/models/types/Workspace'
import type { Commit } from '../../schema/models/types/Commit'
import { type OkType } from '../../lib/Result'
import { Project } from '../../schema/models/types/Project'
import { publisher } from '../../events/publisher'

type RunResult = OkType<typeof runDocumentAtCommit>

export type RunForegroundDocumentParams = {
  workspace: WorkspaceDto
  document: DocumentVersion
  commit: Commit
  project: Project
  parameters: Record<string, unknown>
  customIdentifier?: string
  source: LogSources
  tools: string[]
  mcpHeaders?: Record<string, Record<string, string>>
  userMessage?: string
  abortSignal?: AbortSignal
}

export type RunForegroundDocumentResult = {
  stream: RunResult['stream']
  error: RunResult['error']
  getFinalResponse: () => Promise<{
    response: Awaited<RunResult['lastResponse']>
    provider: Awaited<RunResult['provider']>
  }>
}

/**
 * Executes a foreground document run and provides helpers to build the final response.
 */
export async function runForegroundDocument(
  params: RunForegroundDocumentParams,
): Promise<RunForegroundDocumentResult> {
  const {
    workspace,
    document,
    commit,
    parameters,
    customIdentifier,
    source,
    abortSignal,
    tools,
    mcpHeaders,
    userMessage,
    project,
  } = params

  const result = await runDocumentAtCommit({
    workspace,
    document,
    commit,
    parameters,
    customIdentifier: customIdentifier ?? undefined,
    source,
    abortSignal,
    context: BACKGROUND({ workspaceId: workspace.id }),
    tools: buildClientToolHandlersMap(tools ?? []),
    mcpHeaders,
    userMessage: userMessage ?? undefined,
  }).then((r) => r.unwrap())

  const runUuid = result.uuid
  await publisher.publishLater({
    type: 'documentRunStarted',
    data: {
      eventContext: 'foreground',
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      run: {
        uuid: runUuid,
        queuedAt: new Date(),
        source,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
      },
      parameters,
      customIdentifier,
      tools,
      userMessage,
    },
  })

  return {
    stream: result.stream,
    error: result.error,
    getFinalResponse: async () => {
      const runError = await result.error
      if (runError) throw runError

      const response = await result.lastResponse
      if (!response)
        throw new LatitudeError('Stream ended with no error and no content')

      const provider = await result.provider
      if (!provider) {
        throw new LatitudeError('Provider not found in stream result')
      }

      return { response, provider }
    },
  }
}
