import { hasOwnProperty } from '$core/lib'
import { Project } from '$core/schema'
import { createCommit as createCommitFn } from '$core/services/commits/create'

import { createProject, ICreateProject } from './projects'

export type ICreateDraft = {
  project?: Project | ICreateProject
}
export async function createDraft({ project }: Partial<ICreateDraft> = {}) {
  let projectId = hasOwnProperty<number, object, string>(project, 'id')
    ? project.id
    : (await createProject(project)).project.id

  const result = await createCommitFn({ commit: { projectId } })
  const commit = result.unwrap()

  return { commit }
}
