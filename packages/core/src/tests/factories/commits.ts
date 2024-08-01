import { faker } from '@faker-js/faker'
import { Project, SafeUser } from '$core/browser'
import { hasOwnProperty } from '$core/lib'
import { createCommit as createCommitFn } from '$core/services/commits/create'

import { createProject, ICreateProject } from './projects'

export type ICreateDraft = {
  user: SafeUser
  project?: Project | ICreateProject
}
export async function createDraft({ project, user }: ICreateDraft) {
  let projectModel = hasOwnProperty<number, object, string>(project, 'id')
    ? (project as unknown as Project)
    : (await createProject(project)).project

  const result = await createCommitFn({
    project: projectModel,
    user,
    data: {
      title: faker.lorem.sentence(4),
    },
  })
  const commit = result.unwrap()

  return { commit }
}
