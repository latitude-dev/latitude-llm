import type { Project, SafeUser } from '$core/browser'
import { CommitStatus } from '$core/constants'
import { mergeCommit } from '$core/services'
import * as factories from '$core/tests/factories'
import { beforeEach, describe, expect, it } from 'vitest'

import { CommitsRepository } from './index'

async function createDraftsCommits(project: Project, user: SafeUser) {
  const results = []
  for (let i = 0; i < 10; i++) {
    results.push(factories.createDraft({ project, user }))
  }
  return Promise.all(results)
}
let project: Project
let repository: CommitsRepository
describe('Commits by project', () => {
  beforeEach(async () => {
    let { project: firstProject, user } = await factories.createProject()
    const drafsCommits = await createDraftsCommits(firstProject, user)
    await Promise.all([
      mergeCommit(drafsCommits[0]!.commit),
      mergeCommit(drafsCommits[1]!.commit),
    ])
    project = firstProject
    repository = new CommitsRepository(project.workspaceId)
  })

  it('gets all commits', async () => {
    const list = await repository
      .getCommitsByProject({ project })
      .then((r) => r.unwrap())
    expect(list).toHaveLength(11)
  })

  it('get merged commits', async () => {
    const list = await repository
      .getCommitsByProject({
        project,
        filterByStatus: CommitStatus.Merged,
      })
      .then((r) => r.unwrap())
    expect(list).toHaveLength(3)
  })

  it('get drafts commits', async () => {
    const list = await repository
      .getCommitsByProject({
        project,
        filterByStatus: CommitStatus.Draft,
      })
      .then((r) => r.unwrap())
    expect(list).toHaveLength(8)
  })

  it('get first page of drafts commits', async () => {
    const list = await repository
      .getCommitsByProject({
        project,
        filterByStatus: CommitStatus.Draft,
        page: 1,
        pageSize: 5,
      })
      .then((r) => r.unwrap())
    expect(list).toHaveLength(5)
  })
})
