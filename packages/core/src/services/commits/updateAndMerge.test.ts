import { describe, expect, it } from 'vitest'

import { findHeadCommit } from '../../data-access/commits'
import { updateAndMergeCommit } from './updateAndMerge'
import { createFeature } from '../features/create'
import { toggleWorkspaceFeature } from '../workspaceFeatures/toggle'
import { DISABLE_VERSION_DEPLOY_FLAG } from '../workspaceFeatures/flags'

describe('updateAndMergeCommit', () => {
  it('updates and merges a draft commit', async (ctx) => {
    const { project, workspace, user, providers } =
      await ctx.factories.createProject()
    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    await ctx.factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })

    const result = await updateAndMergeCommit({
      workspace,
      commit: draft,
      data: {
        title: 'Updated Title',
        description: 'Updated Description',
      },
    })

    expect(result.ok).toBe(true)
    const mergedCommit = result.unwrap()
    expect(mergedCommit.title).toBe('Updated Title')
    expect(mergedCommit.description).toBe('Updated Description')
    expect(mergedCommit.mergedAt).toBeTruthy()
    expect(mergedCommit.version).toBe(1)

    const headCommit = await findHeadCommit({ projectId: project.id }).then(
      (r) => r.unwrap(),
    )
    expect(headCommit.id).toBe(mergedCommit.id)
  })

  it('fails when trying to update and merge a merged commit', async (ctx) => {
    const { workspace, commit } = await ctx.factories.createProject()

    const result = await updateAndMergeCommit({
      workspace,
      commit,
      data: {
        title: 'Updated Title',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot modify a merged commit')
  })

  it('fails loudly when version deploy is disabled for the workspace', async (ctx) => {
    const { project, workspace, user, providers } =
      await ctx.factories.createProject()
    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    await ctx.factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })

    const feature = await createFeature({
      name: DISABLE_VERSION_DEPLOY_FLAG,
    }).then((r) => r.unwrap())
    await toggleWorkspaceFeature(workspace.id, feature.id, true).then((r) =>
      r.unwrap(),
    )

    const result = await updateAndMergeCommit({
      workspace,
      commit: draft,
      data: { title: 'Updated Title' },
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain(
      'Deploying versions is disabled for this workspace',
    )

    const headCommit = await findHeadCommit({ projectId: project.id }).then(
      (r) => r.value,
    )
    expect(headCommit?.id).not.toBe(draft.id)
  })

  it('merges without updates if no data is provided', async (ctx) => {
    const { project, workspace, user, providers } =
      await ctx.factories.createProject()
    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    await ctx.factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })

    const result = await updateAndMergeCommit({
      workspace,
      commit: draft,
      data: {},
    })

    expect(result.ok).toBe(true)
    const mergedCommit = result.unwrap()
    expect(mergedCommit.title).toBe(draft.title)
    expect(mergedCommit.description).toBe(draft.description)
    expect(mergedCommit.mergedAt).toBeTruthy()
  })
})
