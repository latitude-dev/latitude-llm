import { env } from '@latitude-data/env'
import {
  unsafelyFindWorkspace,
  unsafelyGetApiKeyByToken,
} from '../../../../data-access'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../repositories'
import { Commit, Workspace, DocumentVersion } from '../../../../browser'
import { Result } from './../../../../lib/Result'

export const DEFAULT_COPILOT_GENERATE_TOOL_RESPONSES_PATH =
  'tool-responses-generator'
function getCopilotCredentials() {
  const apiKey = env.COPILOT_WORKSPACE_API_KEY
  const projectId = env.COPILOT_PROJECT_ID
  const generateToolResponsesPath =
    env.COPILOT_GENERATE_TOOL_RESPONSES_PATH ??
    DEFAULT_COPILOT_GENERATE_TOOL_RESPONSES_PATH
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

export type AutogenerateToolResponseCopilotData = {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}

let CACHED_COPILOT_DATA: AutogenerateToolResponseCopilotData | undefined =
  undefined

export async function getCopilotDataForGenerateToolResponses() {
  if (CACHED_COPILOT_DATA !== undefined) return Result.ok(CACHED_COPILOT_DATA)

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
  const commitResult = await commitScope.getHeadCommit(projectId)
  if (commitResult.error) return buildError({ data: 'head commit' })

  const commit = commitResult.value!
  const documentScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentScope.getDocumentByPath({
    commit,
    path: generateToolResponsesPath,
  })
  if (documentResult.error) return buildError({ data: 'document' })

  const document = documentResult.value
  CACHED_COPILOT_DATA = { workspace, commit, document }

  return Result.ok(CACHED_COPILOT_DATA)
}
