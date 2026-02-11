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
import { CommitsRepository } from '../../repositories'
import { findProjectById } from '../../queries/projects/findById'
import { findProjectByName } from '../../queries/projects/findByName'
import { type Project } from '../../schema/models/types/Project'
import { type WorkspaceDto } from '../../schema/models/types/Workspace'
import { Commit } from '../../schema/models/types/Commit'
import { HEAD_COMMIT } from '@latitude-data/constants'

export type CopilotData = {
  workspace: WorkspaceDto
  project: Project
  commit: Commit
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

    const project = await findProjectByName(
      { workspaceId: workspace.id, name: projectName },
      db,
    )
    if (!project) {
      return Result.error(new Error('Copilot project not found'))
    }

    const commitsRepository = new CommitsRepository(workspace.id, db)
    const commit = await commitsRepository.getHeadCommit(project.id)
    if (!commit) {
      return Result.error(new Error('Copilot commit not found'))
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
      project,
      commit,
      apiKeyToken: apiKeyResult.value.token,
    })
  }

  const apiKeyToken = env.COPILOT_WORKSPACE_API_KEY
  const projectId = env.COPILOT_PROJECT_ID
  const versionUuid = env.COPILOT_VERSION_UUID

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

  const project = await findProjectById(
    { workspaceId: workspace.id, id: projectId },
    db,
  )
  if (!project) {
    return Result.error(new Error('Copilot project not found'))
  }

  const commitsRepository = new CommitsRepository(workspace.id, db)
  const commitResult = await commitsRepository.getCommitByUuid({
    projectId,
    uuid: versionUuid ?? HEAD_COMMIT,
    includeInitialDraft: true,
  })
  if (commitResult.error) {
    return Result.error(new Error('Copilot commit not found'))
  }
  const commit = commitResult.unwrap()

  return Result.ok({
    workspace,
    project,
    commit,
    apiKeyToken,
  })
}
