import { env } from '@latitude-data/env'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { Result, TypedResult } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { HEAD_COMMIT } from '@latitude-data/constants'
import { getCopilotData } from '../copilot/getCopilotData'

function buildError({ data }: { data: string }) {
  return Result.error(
    new Error(
      `There was an error getting the ${data} for running a batch job with Copilot auto-tool-responses`,
    ),
  )
}

export type ToolSimulationPrompt = {
  workspace: WorkspaceDto
  commit: Commit
  document: DocumentVersion
}

let CACHED_TOOL_SIMULATION_PROMPT: ToolSimulationPrompt | undefined = undefined

export async function getToolSimulationPrompt() {
  if (CACHED_TOOL_SIMULATION_PROMPT !== undefined)
    return Result.ok(CACHED_TOOL_SIMULATION_PROMPT)

  const generateToolResponsesPath =
    env.COPILOT_PROMPT_SIMULATE_TOOL_RESPONSES_PATH

  const copilotDataResult = await getCopilotData()
  if (copilotDataResult.error) {
    return buildError({ data: copilotDataResult.error.message })
  }

  const { workspace, project } = copilotDataResult.value
  const projectId = project.id

  const commitScope = new CommitsRepository(workspace.id)
  const commitResult = await commitScope.getCommitByUuid({
    projectId,
    uuid: HEAD_COMMIT,
  })
  if (commitResult.error) return buildError({ data: 'head commit' })

  const commit = commitResult.value!
  const documentScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentScope.getDocumentByPath({
    commit,
    path: generateToolResponsesPath,
  })
  if (documentResult.error) return buildError({ data: 'document' })

  const document = documentResult.value
  CACHED_TOOL_SIMULATION_PROMPT = { workspace, commit, document }

  return Result.ok(CACHED_TOOL_SIMULATION_PROMPT)
}
