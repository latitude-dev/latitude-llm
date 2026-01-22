import { env } from '@latitude-data/env'
import { database } from '../../client'
import {
  unsafelyFindWorkspace,
  unsafelyFindWorkspaceByName,
} from '../../data-access/workspaces'
import {
  unsafelyGetApiKeyByToken,
  unsafelyGetFirstApiKeyByWorkspaceId,
} from '../../data-access/apiKeys'
import { Result, TypedResult } from '../../lib/Result'
import { ProjectsRepository } from '../../repositories'
import { type Project } from '../../schema/models/types/Project'
import { type WorkspaceDto } from '../../schema/models/types/Workspace'

export type CopilotData = {
  workspace: WorkspaceDto
  project: Project
  apiKeyToken: string
}

/**
 * Resolves copilot workspace, project, and API key based on environment.
 */
export async function getCopilotData(
  db = database,
): Promise<TypedResult<CopilotData, Error>> {
  if (env.LATITUDE_ENTERPRISE_MODE) {
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

    const workspace = await unsafelyFindWorkspaceByName(workspaceName, db)
    if (!workspace) {
      return Result.error(new Error('Copilot workspace not found'))
    }

    const projectsRepository = new ProjectsRepository(workspace.id, db)
    const projectResult = await projectsRepository.getProjectByName(projectName)
    if (projectResult.error) {
      return Result.error(new Error('Copilot project not found'))
    }

    const apiKeyResult = await unsafelyGetFirstApiKeyByWorkspaceId(
      {
        workspaceId: workspace.id,
      },
      db,
    )
    if (apiKeyResult.error) {
      return Result.error(new Error('Copilot api key not found'))
    }

    return Result.ok({
      workspace,
      project: projectResult.value,
      apiKeyToken: apiKeyResult.value.token,
    })
  }

  const apiKeyToken = env.COPILOT_WORKSPACE_API_KEY
  const projectId = env.COPILOT_PROJECT_ID

  if (!apiKeyToken) {
    return Result.error(new Error('COPILOT_WORKSPACE_API_KEY is not set'))
  }
  if (!projectId) {
    return Result.error(new Error('COPILOT_PROJECT_ID is not set'))
  }

  const apiKeyResult = await unsafelyGetApiKeyByToken(
    {
      token: apiKeyToken,
    },
    db,
  )
  if (apiKeyResult.error) {
    return Result.error(new Error('Copilot api key not found'))
  }

  const workspace = await unsafelyFindWorkspace(
    apiKeyResult.value.workspaceId,
    db,
  )
  if (!workspace) {
    return Result.error(new Error('Copilot workspace not found'))
  }

  const projectsRepository = new ProjectsRepository(workspace.id, db)
  const projectResult = await projectsRepository.getProjectById(projectId)
  if (projectResult.error) {
    return Result.error(new Error('Copilot project not found'))
  }

  return Result.ok({
    workspace,
    project: projectResult.value,
    apiKeyToken,
  })
}
