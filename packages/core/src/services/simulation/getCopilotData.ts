import { env } from '@latitude-data/env'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import {
  unsafelyFindWorkspace,
  unsafelyFindWorkspaceByName,
} from '../../data-access/workspaces'
import {
  unsafelyGetApiKeyByToken,
  unsafelyGetFirstApiKeyByWorkspaceId,
} from '../../data-access/apiKeys'
import { Result, TypedResult } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '../../repositories'
import { HEAD_COMMIT } from '@latitude-data/constants'

type CopilotCredentials =
  | {
      mode: 'enterprise'
      workspaceName: string
      projectName: string
      generateToolResponsesPath: string
    }
  | {
      mode: 'standard'
      apiKey: string
      projectId: number
      generateToolResponsesPath: string
    }

function getCopilotCredentials(): TypedResult<CopilotCredentials, Error> {
  const isEnterpriseMode = env.LATITUDE_ENTERPRISE_MODE
  const generateToolResponsesPath =
    env.COPILOT_PROMPT_SIMULATE_TOOL_RESPONSES_PATH

  if (isEnterpriseMode) {
    const workspaceName = env.ENTERPRISE_COPILOT_WORKSPACE_NAME
    const projectName = env.ENTERPRISE_COPILOT_PROJECT_NAME

    if (!workspaceName) {
      return Result.error(
        new Error('ENTERPRISE_COPILOT_WORKSPACE_NAME is not set'),
      )
    }
    if (!projectName) {
      return Result.error(
        new Error('ENTERPRISE_COPILOT_PROJECT_NAME is not set'),
      )
    }

    return Result.ok({
      mode: 'enterprise',
      workspaceName,
      projectName,
      generateToolResponsesPath,
    })
  }

  const apiKey = env.COPILOT_WORKSPACE_API_KEY
  const projectId = env.COPILOT_PROJECT_ID
  if (!apiKey) {
    return Result.error(new Error('COPILOT_WORKSPACE_API_KEY is not set'))
  }
  if (!projectId) {
    return Result.error(new Error('COPILOT_PROJECT_ID is not set'))
  }

  return Result.ok({
    mode: 'standard',
    apiKey,
    projectId,
    generateToolResponsesPath,
  })
}

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

  const credentialsResult = getCopilotCredentials()
  if (credentialsResult.error) return credentialsResult

  const credentials = credentialsResult.value
  const generateToolResponsesPath = credentials.generateToolResponsesPath
  const isEnterpriseMode = credentials.mode === 'enterprise'

  const apiKeyResult = isEnterpriseMode
    ? await (async () => {
        const workspace = await unsafelyFindWorkspaceByName(
          credentials.workspaceName,
        )
        if (!workspace) return Result.error(new Error('workspace'))

        const projectResult = await new ProjectsRepository(
          workspace.id,
        ).getProjectByName(credentials.projectName)
        if (projectResult.error) return Result.error(new Error('project'))

        const apiKeyResult = await unsafelyGetFirstApiKeyByWorkspaceId({
          workspaceId: workspace.id,
        })
        if (apiKeyResult.error) return Result.error(new Error('API key'))

        return Result.ok({
          workspace,
          projectId: projectResult.value.id,
          apiKeyToken: apiKeyResult.value.token,
        })
      })()
    : await (async () => {
        const apiKeyResult = await unsafelyGetApiKeyByToken({
          token: credentials.apiKey,
        })
        if (apiKeyResult.error) return Result.error(new Error('API key'))

        const workspace = await unsafelyFindWorkspace(
          apiKeyResult.value.workspaceId,
        )
        if (!workspace) return Result.error(new Error('workspace'))

        return Result.ok({
          workspace,
          projectId: credentials.projectId,
          apiKeyToken: credentials.apiKey,
        })
      })()

  if (apiKeyResult.error)
    return buildError({ data: apiKeyResult.error.message })

  const { workspace, projectId } = apiKeyResult.value

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
