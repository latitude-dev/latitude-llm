import { describe, expect, it } from 'vitest'

import { CommitsRepository } from '../../repositories'
import * as factories from '../../tests/factories'
import { deleteCommitDraft } from './delete'

describe('deleteCommitDraft', () => {
  it('should return an error if the commit is the only one in the project', async () => {
    const { commit } = await factories.createProject({
      skipMerge: true,
    })

    const result = await deleteCommitDraft(commit)

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe(
      'Cannot delete the only version in a project',
    )
  })

  it('fails when trying to remove a merged commit', async () => {
    const { commit } = await factories.createProject()

    const result = await deleteCommitDraft(commit)

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('Cannot modify a merged commit')
  })

  it('removes a draft with content', async () => {
    const { workspace, project, user } = await factories.createProject({
      skipMerge: true,
    })

    const { commit: draft } = await factories.createDraft({
      project,
      user,
    })

    const commitsRepository = new CommitsRepository(workspace.id)
    const allCommits = await commitsRepository.getCommits()
    expect(allCommits.map((c) => c.id)).toContain(draft.id)

    const result = await deleteCommitDraft(draft)
    expect(result.ok).toBe(true)

    const newAllCommits = await commitsRepository.getCommits()
    expect(newAllCommits.map((c) => c.id)).not.toContain(draft.id)
  })
})
