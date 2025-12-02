import { LogSources } from '@latitude-data/constants'
import { LatitudeError } from '../../lib/errors'
import { BACKGROUND } from '../../telemetry'
import { buildClientToolHandlersMap } from '../documents/tools/clientTools/handlers'
import { enqueueShadowTestChallenger } from '../deploymentTests/handlers/handleShadowTestRun'
import { runDocumentAtCommit } from './runDocumentAtCommit'
import { ProviderApiKeysRepository } from '../../repositories'
import type { DeploymentTest } from '../../schema/models/types/DeploymentTest'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { Workspace } from '../../schema/models/types/Workspace'
import type { Commit } from '../../schema/models/types/Commit'
import { Result, type OkType } from '../../lib/Result'
import { Project } from '../../schema/models/types/Project'
import { captureException } from '../../utils/datadogCapture'

type RunResult = OkType<typeof runDocumentAtCommit>

export type RunForegroundDocumentParams = {
  workspace: Workspace
  document: DocumentVersion
  commit: Commit
  project: Project
  parameters: Record<string, unknown>
  customIdentifier?: string
  source: LogSources
  tools: string[]
  userMessage?: string
  activeDeploymentTest?: DeploymentTest
  abortSignal?: AbortSignal
}

export type RunForegroundDocumentResult = {
  stream: RunResult['stream']
  error: RunResult['error']
  getFinalResponse: () => Promise<{
    response: Awaited<RunResult['lastResponse']>
    provider: Awaited<ReturnType<ProviderApiKeysRepository['find']>> extends {
      unwrap: () => infer R
    }
      ? R
      : never
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
    userMessage,
    activeDeploymentTest,
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
    userMessage: userMessage ?? undefined,
  }).then((r) => r.unwrap())

  return {
    stream: result.stream,
    error: result.error,
    getFinalResponse: async () => {
      const runError = await result.error
      if (runError) throw runError

      const response = await result.lastResponse
      if (!response)
        throw new LatitudeError('Stream ended with no error and no content')

      if (activeDeploymentTest?.testType === 'shadow') {
        const result = await enqueueShadowTestChallenger({
          workspace,
          document,
          activeDeploymentTest: activeDeploymentTest,
          parameters,
          customIdentifier,
          tools,
          userMessage,
          commit,
          project,
        })

        if (!Result.isOk(result)) {
          captureException(result.error)
        }
      }

      const providerScope = new ProviderApiKeysRepository(workspace.id)
      const provider = await providerScope
        .find(response.providerLog?.providerId)
        .then((r) => r.unwrap())

      return { response, provider }
    },
  }
}
