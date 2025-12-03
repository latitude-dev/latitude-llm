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

describe('getCommitsHistory', () => {
  it('handles commit with mergedAt as a string (from queue serialization)', async () => {
    const { workspace, project, user, providers, commit } =
      await factories.createProject()

    // Create additional commits
    const draft1 = await factories.createDraft({ project, user })
    await createNewDocument({
      user,
      workspace,
      commit: draft1.commit,
      path: 'doc1',
      content: factories.helpers.createPrompt({ provider: providers[0]! }),
    })
    await mergeCommit(draft1.commit)

    const draft2 = await factories.createDraft({ project, user })
    await createNewDocument({
      user,
      workspace,
      commit: draft2.commit,
      path: 'doc2',
      content: factories.helpers.createPrompt({ provider: providers[0]! }),
    })
    const mergedCommit2 = await mergeCommit(draft2.commit).then((r) =>
      r.unwrap(),
    )

    const repository = new CommitsRepository(workspace.id)

    // Simulate commit coming from queue with mergedAt as string
    const commitWithStringDate = {
      ...mergedCommit2,
      mergedAt: mergedCommit2.mergedAt!.toISOString() as any, // Simulate JSON serialization
    }

    const history = await repository.getCommitsHistory({
      commit: commitWithStringDate,
    })

    // Should include the current commit and all previous merged commits
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(history.some((c) => c.id === mergedCommit2.id)).toBe(true)
    expect(history.some((c) => c.id === commit.id)).toBe(true)
  })
})
