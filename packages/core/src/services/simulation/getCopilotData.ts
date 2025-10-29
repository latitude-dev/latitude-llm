import { env } from '@latitude-data/env'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { unsafelyGetApiKeyByToken } from '../../data-access/apiKeys'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { HEAD_COMMIT } from '@latitude-data/constants'

function getCopilotCredentials() {
  const apiKey = env.COPILOT_WORKSPACE_API_KEY
  const projectId = env.COPILOT_PROJECT_ID
  const generateToolResponsesPath =
    env.COPILOT_PROMPT_SIMULATE_TOOL_RESPONSES_PATH
  if (!apiKey) {
    return Result.error(new Error('COPILOT_WORKSPACE_API_KEY is not set'))
  }
  if (!projectId) {
    return Result.error(new Error('COPILOT_PROJECT_ID is not set'))
  }

  return Result.ok({ apiKey, projectId, generateToolResponsesPath })
}

function buildError({ data }: { data: string }) {
  return Result.error(
    new Error(
      `There was an error getting the ${data} for running a batch job with Copilot auto-tool-responses`,
    ),
  )
}

export type ToolSimulationPrompt = {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}

let CACHED_TOOL_SIMULATION_PROMPT: ToolSimulationPrompt | undefined = undefined

export async function getToolSimulationPrompt() {
  if (CACHED_TOOL_SIMULATION_PROMPT !== undefined)
    return Result.ok(CACHED_TOOL_SIMULATION_PROMPT)

  const credentialsResult = getCopilotCredentials()
  if (credentialsResult.error) return credentialsResult

  const {
    apiKey: token,
    projectId,
    generateToolResponsesPath,
  } = credentialsResult.value
  const apiKeyResult = await unsafelyGetApiKeyByToken({
    token,
  })
  if (apiKeyResult.error) return buildError({ data: 'API key' })

  const workspace = await unsafelyFindWorkspace(apiKeyResult.value.workspaceId)
  if (!workspace) return buildError({ data: 'workspace' })

  const commitScope = new CommitsRepository(workspace.id)
  const commitResult = await commitScope.getCommitByUuid({
    projectId,
    uuid: env.COPILOT_GENERATE_TOOL_RESPONSES_COMMIT_UUID || HEAD_COMMIT,
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
