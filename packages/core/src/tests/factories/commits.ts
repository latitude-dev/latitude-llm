import { faker } from '@faker-js/faker'

import { Project, User } from '../../browser'
import { createCommit as createCommitFn } from '../../services/commits/create'
import { createProject } from './createProject'
import { ICreateProject } from './projects'
import { hasOwnProperty } from './../../lib/commonTypes'

export type ICreateCommit = {
  projectId: number
  user: User
  mergedAt?: Date | null
  title?: string
}

export type ICreateDraft = {
  project: Project | ICreateProject
  user: User
}

export async function createCommit({
  projectId,
  mergedAt,
  title,
  user,
}: ICreateCommit) {
  const result = await createCommitFn({
    project: { id: projectId } as Project,
    user,
    data: {
      title: title ?? faker.lorem.sentence(4),
      mergedAt: mergedAt ?? undefined,
    },
  })
  return result.unwrap()
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
