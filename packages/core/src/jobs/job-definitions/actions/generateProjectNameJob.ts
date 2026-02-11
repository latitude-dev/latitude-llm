import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError } from '../../../lib/errors'
import { findProjectById } from '../../../queries/projects/findById'
import {
  ensureAgentName,
  generateAgentDetails,
} from '../../../services/actions/createAgent'
import { updateProject } from '../../../services/projects/update'
import { WebsocketClient } from '../../../websockets/workers'

export type GenerateProjectNameJobData = {
  workspaceId: number
  projectId: number
  prompt: string
}

export const generateProjectNameJob = async (
  job: Job<GenerateProjectNameJobData>,
) => {
  const { workspaceId, projectId, prompt } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const project = await findProjectById({ workspaceId: workspace.id, id: projectId }).then((r) => r.unwrap())
  if (project.deletedAt) return

  let details = await generateAgentDetails({ prompt }).then((r) => r.unwrap())
  const ensured = await ensureAgentName({ name: details.name, workspace }).then(
    (r) => r.unwrap(),
  )
  details = { ...details, ...ensured }

  const updated = await updateProject(project, { name: details.name }).then(
    (r) => r.unwrap(),
  )

  await WebsocketClient.sendEvent('projectUpdated', {
    workspaceId: workspace.id,
    data: { workspaceId: workspace.id, project: updated },
  })
}
