import { Project } from '$core/schema'
import createCommitFn from '$core/services/commits/create'

import { createProject, ICreateProject } from './projects'

export type ICreateDraft = {
  project?: Project | ICreateProject
}
export async function createDraft(commitData: Partial<ICreateDraft> = {}) {
  let project = commitData.project ?? {}
  if (!('id' in project)) {
    const { project: newProject } = await createProject(project)
    project = newProject
  }

  const result = await createCommitFn({ projectId: (project as Project).id })
  const commit = result.unwrap()

  return { commit }
}
