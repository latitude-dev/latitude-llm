import { LogSources } from '@latitude-data/constants'
import { Message } from '@latitude-data/constants/messages'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import { unsafelyFindWorkspace } from '../../../../data-access/workspaces'
import { NotFoundError } from '../../../../lib/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ExperimentsRepository,
} from '../../../../repositories'
import { runDocumentAtCommit } from '../../../../services/commits/runDocumentAtCommit'
import { BACKGROUND } from '../../../../telemetry'
import { captureException } from '../../../../utils/datadogCapture'

type RunDocumentResult = {
  success: boolean
  conversationUuid?: string
  messages?: Message[]
  error?: string
}

export async function runDocumentActivityHandler({
  workspaceId,
  projectId,
  commitUuid,
  documentUuid,
  experimentId,
  runUuid,
  parameters,
  customPrompt,
  simulationSettings,
}: {
  workspaceId: number
  projectId: number
  commitUuid: string
  documentUuid: string
  experimentId: number
  runUuid: string
  parameters: Record<string, unknown>
  customPrompt?: string
  simulationSettings?: SimulationSettings
}): Promise<RunDocumentResult> {
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    throw new NotFoundError(`Workspace not found: ${workspaceId}`)
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitByUuid({ uuid: commitUuid, projectId })
    .then((r) => r.unwrap())

  const experimentsRepository = new ExperimentsRepository(workspace.id)
  const experiment = await experimentsRepository
    .find(experimentId)
    .then((r) => r.unwrap())

  const docRepo = new DocumentVersionsRepository(workspace.id)
  const document = await docRepo
    .getDocumentAtCommit({
      projectId,
      commitUuid,
      documentUuid,
    })
    .then((r) => r.unwrap())

  try {
    const result = await runDocumentAtCommit({
      workspace,
      document,
      commit,
      errorableUuid: runUuid,
      parameters,
      experiment,
      source: LogSources.Experiment,
      customPrompt,
      context: BACKGROUND({ workspaceId }),
      simulationSettings,
    }).then((r) => r.unwrap())

    const messages = await result.conversation.messages
    await result.lastResponse

    return {
      success: true,
      conversationUuid: result.uuid,
      messages,
    }
  } catch (error) {
    captureException(error as Error)
    return {
      success: false,
      error: (error as Error).message,
    }
  }
}
