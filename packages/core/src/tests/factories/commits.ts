import { faker } from '@faker-js/faker'

import { Project, SafeUser } from '../../browser'
import { hasOwnProperty } from '../../lib'
import { createCommit as createCommitFn } from '../../services/commits/create'
import { createProject } from './createProject'
import { ICreateProject } from './projects'

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
