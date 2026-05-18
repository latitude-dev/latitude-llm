import { Providers } from '@latitude-data/constants'
import { describe, expect, it } from 'vitest'
import { database } from '../../client'
import { documentVersions } from '../../schema/models/documentVersions'
import { mergeCommit } from '../../services/commits'
import { destroyDocument, updateDocument } from '../../services/documents'
import * as factories from '../../tests/factories'
import { DocumentVersionsRepository } from './index'

describe('getDocumentByPath', () => {
  it('finds a document in a merged commit by path', async (ctx) => {
    const { project, commit } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'prompts/chat': ctx.factories.helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })

    const repo = new DocumentVersionsRepository(project.workspaceId)
    const result = await repo.getDocumentByPath({
      commit,
      path: 'prompts/chat',
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap().path).toBe('prompts/chat')
  })

  it('returns NotFoundError when path does not exist in merged commit', async (ctx) => {
    const { project, commit } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        existing: ctx.factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })

    const repo = new DocumentVersionsRepository(project.workspaceId)
    const result = await repo.getDocumentByPath({
      commit,
      path: 'does-not-exist',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toContain('does-not-exist')
  })

  it('returns the latest merged version when the document has been updated across commits', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    const { commit: draft1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft1,
      path: 'my-doc',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_1',
      }),
    })
    const merged1 = await mergeCommit(draft1).then((r) => r.unwrap())

    const { commit: draft2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft2,
      document: doc,
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_2',
      }),
    }).then((r) => r.unwrap())
    const merged2 = await mergeCommit(draft2).then((r) => r.unwrap())

    const repo = new DocumentVersionsRepository(project.workspaceId)

    const atMerged1 = await repo
      .getDocumentByPath({ commit: merged1, path: 'my-doc' })
      .then((r) => r.unwrap())
    expect(atMerged1.content).toContain('VERSION_1')

    const atMerged2 = await repo
      .getDocumentByPath({ commit: merged2, path: 'my-doc' })
      .then((r) => r.unwrap())
    expect(atMerged2.content).toContain('VERSION_2')
  })

  it('finds a document in a draft commit by path', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    const { commit: draft } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: 'draft-only',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'DRAFT_CONTENT',
      }),
    })

    const repo = new DocumentVersionsRepository(project.workspaceId)
    const result = await repo.getDocumentByPath({
      commit: draft,
      path: 'draft-only',
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap().content).toContain('DRAFT_CONTENT')
  })

  it('finds a merged document from a draft commit when the document has not been modified in the draft', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    const { commit: draft1 } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft1,
      path: 'merged-doc',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'MERGED_CONTENT',
      }),
    })
    await mergeCommit(draft1).then((r) => r.unwrap())

    const { commit: draft2 } = await factories.createDraft({ project, user })

    const repo = new DocumentVersionsRepository(project.workspaceId)
    const result = await repo.getDocumentByPath({
      commit: draft2,
      path: 'merged-doc',
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap().content).toContain('MERGED_CONTENT')
  })

  it('finds a document created in a past merged commit when later merged commits exist', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    // commit1: create "doc-a"
    const { commit: draft1 } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft1,
      path: 'doc-a',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'DOC_A_CONTENT',
      }),
    })
    const merged1 = await mergeCommit(draft1).then((r) => r.unwrap())

    // commit2: create "doc-b" — does not touch "doc-a"
    const { commit: draft2 } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft2,
      path: 'doc-b',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'DOC_B_CONTENT',
      }),
    })
    const merged2 = await mergeCommit(draft2).then((r) => r.unwrap())

    const repo = new DocumentVersionsRepository(project.workspaceId)

    // Querying from merged2: both docs must be visible
    const docAFromMerged2 = await repo
      .getDocumentByPath({ commit: merged2, path: 'doc-a' })
      .then((r) => r.unwrap())
    expect(docAFromMerged2.content).toContain('DOC_A_CONTENT')

    const docBFromMerged2 = await repo
      .getDocumentByPath({ commit: merged2, path: 'doc-b' })
      .then((r) => r.unwrap())
    expect(docBFromMerged2.content).toContain('DOC_B_CONTENT')

    // Querying from merged1: "doc-b" must NOT be visible (created after merged1)
    const docBFromMerged1 = await repo.getDocumentByPath({
      commit: merged1,
      path: 'doc-b',
    })
    expect(docBFromMerged1.ok).toBe(false)
  })

  it('finds a document via merged history from a draft when later merged commits exist between its creation and the draft', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    // commit1: create "doc-a"
    const { commit: draft1 } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft1,
      path: 'doc-a',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'DOC_A_CONTENT',
      }),
    })
    await mergeCommit(draft1).then((r) => r.unwrap())

    // commit2: create "doc-b" — does not touch "doc-a"
    const { commit: draft2 } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft2,
      path: 'doc-b',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'DOC_B_CONTENT',
      }),
    })
    await mergeCommit(draft2).then((r) => r.unwrap())

    // draft3: touches only "doc-c" — neither "doc-a" nor "doc-b" are edited
    const { commit: draft3 } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft3,
      path: 'doc-c',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'DOC_C_CONTENT',
      }),
    })

    const repo = new DocumentVersionsRepository(project.workspaceId)

    // All three docs must be visible from the draft
    const docAFromDraft = await repo
      .getDocumentByPath({ commit: draft3, path: 'doc-a' })
      .then((r) => r.unwrap())
    expect(docAFromDraft.content).toContain('DOC_A_CONTENT')

    const docBFromDraft = await repo
      .getDocumentByPath({ commit: draft3, path: 'doc-b' })
      .then((r) => r.unwrap())
    expect(docBFromDraft.content).toContain('DOC_B_CONTENT')

    const docCFromDraft = await repo
      .getDocumentByPath({ commit: draft3, path: 'doc-c' })
      .then((r) => r.unwrap())
    expect(docCFromDraft.content).toContain('DOC_C_CONTENT')
  })

  it('returns the version from the queried commit when a document was created in a past commit and edited in the current commit', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    // commit1: create "doc-a"
    const { commit: draft1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft1,
      path: 'doc-a',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_1',
      }),
    })
    const merged1 = await mergeCommit(draft1).then((r) => r.unwrap())

    // commit2: edit "doc-a"
    const { commit: draft2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft2,
      document: doc,
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'VERSION_2',
      }),
    }).then((r) => r.unwrap())
    const merged2 = await mergeCommit(draft2).then((r) => r.unwrap())

    const repo = new DocumentVersionsRepository(project.workspaceId)

    // Querying from merged1 must return VERSION_1
    const atMerged1 = await repo
      .getDocumentByPath({ commit: merged1, path: 'doc-a' })
      .then((r) => r.unwrap())
    expect(atMerged1.content).toContain('VERSION_1')

    // Querying from merged2 must return VERSION_2
    const atMerged2 = await repo
      .getDocumentByPath({ commit: merged2, path: 'doc-a' })
      .then((r) => r.unwrap())
    expect(atMerged2.content).toContain('VERSION_2')
  })

  it('returns NotFoundError for the old path when a document is renamed in a draft', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    const { commit: draft1 } = await factories.createDraft({ project, user })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft1,
      path: 'original-path',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'CONTENT',
      }),
    })
    await mergeCommit(draft1).then((r) => r.unwrap())

    // Rename the document in a new draft
    const { commit: draft2 } = await factories.createDraft({ project, user })
    await updateDocument({
      commit: draft2,
      document: doc,
      path: 'new-path',
    }).then((r) => r.unwrap())

    const repo = new DocumentVersionsRepository(project.workspaceId)

    // Old path should not be visible from the draft
    const oldPathResult = await repo.getDocumentByPath({
      commit: draft2,
      path: 'original-path',
    })
    expect(oldPathResult.ok).toBe(false)

    // New path should be found
    const newPathResult = await repo.getDocumentByPath({
      commit: draft2,
      path: 'new-path',
    })
    expect(newPathResult.ok).toBe(true)
    expect(newPathResult.unwrap().content).toContain('CONTENT')
  })

  it('returns the active document when a previously deleted document held the same path', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    // commit1: create and merge "shared-path" as docA
    const { commit: draft1 } = await factories.createDraft({ project, user })
    const { documentVersion: docA } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft1,
      path: 'shared-path',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'DELETED_CONTENT',
      }),
    })
    await mergeCommit(draft1).then((r) => r.unwrap())

    // commit2: soft-delete docA. The soft-delete row preserves the path.
    const { commit: draft2 } = await factories.createDraft({ project, user })
    await destroyDocument({ document: docA, commit: draft2, workspace }).then(
      (r) => r.unwrap(),
    )
    await mergeCommit(draft2).then((r) => r.unwrap())

    // commit3: create a new docB at the same path
    const { commit: draft3 } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft3,
      path: 'shared-path',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'ACTIVE_CONTENT',
      }),
    })
    const merged3 = await mergeCommit(draft3).then((r) => r.unwrap())

    const repo = new DocumentVersionsRepository(project.workspaceId)
    const result = await repo
      .getDocumentByPath({ commit: merged3, path: 'shared-path' })
      .then((r) => r.unwrap())

    expect(result.deletedAt).toBeNull()
    expect(result.content).toContain('ACTIVE_CONTENT')
  })

  it('does not let a deleted shadow with a higher documentUuid mask the active document at the same path', async (ctx) => {
    // Forces the failure mode deterministically: the SELECT DISTINCT ON
    // subquery emits rows in `document_uuid DESC` order, so a deleted shadow
    // whose UUID sorts above the active row would be returned first by the
    // outer LIMIT 1 without the explicit `deletedAt IS NULL` filter.
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()

    const { commit: draft1 } = await factories.createDraft({ project, user })
    const { documentVersion: active } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft1,
      path: 'shared-path',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'ACTIVE_CONTENT',
      }),
    })
    const merged1 = await mergeCommit(draft1).then((r) => r.unwrap())

    // A second merged commit holds a deleted shadow at the same path with a
    // documentUuid that sorts above the active row.
    const shadowCommit = await factories.createCommit({
      projectId: project.id,
      user,
      mergedAt: new Date(merged1.mergedAt!.getTime() + 1000),
    })

    const higherUuid = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    expect(higherUuid > active.documentUuid).toBe(true)

    await database.insert(documentVersions).values({
      documentUuid: higherUuid,
      commitId: shadowCommit.id,
      path: 'shared-path',
      content: 'shadow',
      deletedAt: new Date(),
    })

    const repo = new DocumentVersionsRepository(project.workspaceId)
    const result = await repo
      .getDocumentByPath({ commit: shadowCommit, path: 'shared-path' })
      .then((r) => r.unwrap())

    expect(result.documentUuid).toBe(active.documentUuid)
    expect(result.content).toContain('ACTIVE_CONTENT')
  })
})
