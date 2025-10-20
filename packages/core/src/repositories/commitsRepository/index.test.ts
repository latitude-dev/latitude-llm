import { beforeEach, describe, expect, it } from 'vitest'
import { CommitStatus } from '../../constants'
import { type Project } from '../../schema/models/types/Project'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { mergeCommit } from '../../services/commits'
import { createNewDocument } from '../../services/documents'
import * as factories from '../../tests/factories'
import { CommitsRepository } from './index'

async function createDraftsCommits(
  user: User,
  workpace: Workspace,
  project: Project,
  provider: ProviderApiKey,
) {
  const results = []
  for (let i = 0; i < 10; i++) {
    const draft = await factories.createDraft({ project, user })
    await createNewDocument({
      user,
      workspace: workpace,
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
    const {
      workspace,
      project: firstProject,
      user,
      providers,
    } = await factories.createProject()
    const drafsCommits = await createDraftsCommits(
      user,
      workspace,
      firstProject,
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
    const { project, workspace, user, providers } =
      await factories.createProject()

    await createDraftsCommits(user, workspace, project, providers[0]!)
  })

  it('does not return commits from other workspaces', async () => {
    const { project: otherProject, commit } = await factories.createProject()
    const otherRepository = new CommitsRepository(otherProject.workspaceId)
    const list = await otherRepository.findAll().then((r) => r.unwrap())

    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe(commit.id)
  })
})
