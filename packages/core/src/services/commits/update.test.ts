import { describe, expect, it } from 'vitest'

import { updateCommit } from './update'

describe('updateCommit', () => {
  it('updates a draft commit', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()
    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const result = await updateCommit({
      workspace,
      commit: draft,
      data: {
        title: 'Updated Title',
        description: 'Updated Description',
      },
    })

    expect(result.ok).toBe(true)
    const updatedCommit = result.unwrap()
    expect(updatedCommit.title).toBe('Updated Title')
    expect(updatedCommit.description).toBe('Updated Description')
  })

  it('fails when trying to update a merged commit', async (ctx) => {
    const { workspace, commit } = await ctx.factories.createProject()

    const result = await updateCommit({
      workspace,
      commit,
      data: {
        title: 'Updated Title',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot modify a merged commit')
  })

  it('fails when no update data is provided', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()
    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const result = await updateCommit({
      workspace,
      commit: draft,
      data: {},
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('No updates provided for the commit')
  })

  it('allows updating only title', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()
    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const result = await updateCommit({
      workspace,
      commit: draft,
      data: {
        title: 'Updated Title',
      },
    })

    expect(result.ok).toBe(true)
    const updatedCommit = result.unwrap()
    expect(updatedCommit.title).toBe('Updated Title')
    expect(updatedCommit.description).toBe(draft.description)
  })

  it('allows updating only description', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()
    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    const result = await updateCommit({
      workspace,
      commit: draft,
      data: {
        description: 'Updated Description',
      },
    })

    expect(result.ok).toBe(true)
    const updatedCommit = result.unwrap()
    expect(updatedCommit.title).toBe(draft.title)
    expect(updatedCommit.description).toBe('Updated Description')
  })

  it('allows setting description to null', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()
    const { commit: draft } = await ctx.factories.createDraft({
      project,
      user,
      // @ts-expect-error
      data: {
        description: 'Initial description',
      },
    })

    const result = await updateCommit({
      workspace,
      commit: draft,
      data: {
        description: null,
      },
    })

    expect(result.ok).toBe(true)
    const updatedCommit = result.unwrap()
    expect(updatedCommit.description).toBeNull()
  })
})
