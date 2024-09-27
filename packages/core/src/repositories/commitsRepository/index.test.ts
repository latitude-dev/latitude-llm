import { beforeEach, describe, expect, it } from 'vitest'

import type { Project, ProviderApiKey, User } from '../../browser'
import { CommitStatus } from '../../constants'
import { mergeCommit } from '../../services/commits'
import { createNewDocument } from '../../services/documents'
import * as factories from '../../tests/factories'
import { CommitsRepository } from './index'

async function createDraftsCommits(
  project: Project,
  user: User,
  provider: ProviderApiKey,
) {
  const results = []
  for (let i = 0; i < 10; i++) {
    const draft = await factories.createDraft({ project, user })
    await createNewDocument({
      commit: draft.commit,
      path: `${i}/foo`,
      content: factories.helpers.createPrompt({ provider }),
    })
    results.push(draft)
  }
  return results
}

let project: Project
let repository: CommitsRepository

describe('Commits by project', () => {
  beforeEach(async () => {
    let {
      project: firstProject,
      user,
      providers,
    } = await factories.createProject()
    const drafsCommits = await createDraftsCommits(
      firstProject,
      user,
      providers[0]!,
    )
    await Promise.all([
      mergeCommit(drafsCommits[0]!.commit),
      mergeCommit(drafsCommits[1]!.commit),
    ])
    project = firstProject
    repository = new CommitsRepository(project.workspaceId)
  })

  it('gets all commits', async () => {
    const list = await repository.getCommitsByProjectQuery({ project })
    expect(list).toHaveLength(11)
  })

  it('get merged commits', async () => {
    const list = await repository.getCommitsByProjectQuery({
      project,
      filterByStatus: CommitStatus.Merged,
    })
    expect(list).toHaveLength(3)
  })

  it('get drafts commits', async () => {
    const list = await repository.getCommitsByProjectQuery({
      project,
      filterByStatus: CommitStatus.Draft,
    })

    expect(list).toHaveLength(8)
  })
})

describe('findAll', () => {
  beforeEach(async () => {
    const { project, user, providers } = await factories.createProject()

    await createDraftsCommits(project, user, providers[0]!)
  })

  it('does not return commits from other workspaces', async () => {
    const { project: otherProject, commit } = await factories.createProject()
    const otherRepository = new CommitsRepository(otherProject.workspaceId)
    const list = await otherRepository.findAll().then((r) => r.unwrap())

    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe(commit.id)
  })
})
