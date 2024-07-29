import { hasOwnProperty } from '$core/lib'
import { Project } from '$core/schema'
import { createCommit as createCommitFn } from '$core/services/commits/create'

import { createProject, ICreateProject } from './projects'

export type ICreateDraft = {
  project?: Project | ICreateProject
}
export async function createDraft({ project }: Partial<ICreateDraft> = {}) {
  let projectModel = hasOwnProperty<number, object, string>(project, 'id')
    ? (project as unknown as Project)
    : (await createProject(project)).project

  const result = await createCommitFn({ project: projectModel, data: {} })
  const commit = result.unwrap()

  return { commit }
}
