import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi, type TestContext } from 'vitest'

import { database } from '../../client'
import { ModifiedDocumentType, Providers } from '@latitude-data/constants'
import { findHeadCommit } from '../../data-access/commits'
import { documentVersions } from '../../schema/models/documentVersions'
import {
  createNewDocument,
  updateDocument,
  destroyDocument,
} from '../documents'
import { mergeCommit } from './merge'
import { getCommitChanges } from './getChanges'
import { DocumentVersionsRepository } from '../../repositories'
import * as publisherModule from '../../events/publisher'
import { waitForTransactionCallbacks } from '../../tests/helpers'

vi.spyOn(publisherModule.publisher, 'publishLater').mockResolvedValue(undefined)

describe('mergeCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(publisherModule.publisher.publishLater).mockResolvedValue(
      undefined,
    )
  })

  it('merges a commit', async (ctx) => {
    const { project, workspace, user, providers } =
      await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    await createNewDocument({
      user,
      workspace,
      commit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })

    const mergedCommit = await mergeCommit(commit).then((r) => r.unwrap())
    expect(mergedCommit.mergedAt).toBeTruthy()
    expect(mergedCommit.version).toBe(1)

    const headCommit = await findHeadCommit({ projectId: project.id }).then(
      (r) => r.unwrap(),
    )
    expect(headCommit.id).toBe(mergedCommit.id)
  })

  it('fails when trying to merge a merged commit', async (ctx) => {
    const { commit } = await ctx.factories.createProject()
    const res = await mergeCommit(commit)
    expect(res.ok).toBe(false)
  })

  it('recomputes all changes in the commit', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    await createNewDocument({
      user,
      workspace,
      commit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })

    const currentChanges = await database
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.commitId, commit.id))

    expect(currentChanges.length).toBe(1)
    expect(currentChanges[0]!.path).toBe('foo')
    expect(currentChanges[0]!.resolvedContent).toBeNull()

    await mergeCommit(commit)

    const mergedChanges = await database
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.commitId, commit.id))

    expect(mergedChanges.length).toBe(1)
    expect(mergedChanges[0]!.path).toBe('foo')
    expect(mergedChanges[0]!.resolvedContent).toBeDefined()
  })

  it('fails when trying to merge a commit with syntax errors', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    await createNewDocument({
      user,
      workspace,
      commit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: '{{foo',
      }),
    })

    const res = await mergeCommit(commit)
    expect(res.ok).toBe(false)
  })

  it('fails when trying to merge a commit with no changes', async (ctx) => {
    const { project, user } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })
    const res = await mergeCommit(commit)
    expect(res.ok).toBe(false)
  })

  it('detects with a new document version does not actually change anything', async (ctx) => {
    const originalContent = ctx.factories.helpers.createPrompt({
      provider: 'openai',
      content: 'foo',
    })

    const { project, user, documents } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: originalContent,
      },
    })

    const { commit } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit,
      document: documents[0]!,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'bar',
      }),
    })

    await updateDocument({
      commit,
      document: documents[0]!,
      content: originalContent, // back to the original content
    })

    const res = await mergeCommit(commit)
    expect(res.ok).toBe(false)
  })

  it('increases the version number of the commit', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()
    const { commit: commit1 } = await ctx.factories.createDraft({
      project,
      user,
    })

    const doc = await createNewDocument({
      workspace,
      user,
      commit: commit1,
      path: 'foo1',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'foo1',
      }),
    }).then((r) => r.unwrap())

    const mergedCommit1 = await mergeCommit(commit1).then((r) => r.unwrap())
    expect(mergedCommit1.version).toBe(1)

    const { commit: commit2 } = await ctx.factories.createDraft({
      project,
      user,
    })

    await updateDocument({
      document: doc,
      commit: commit2,
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'foo2',
      }),
    }).then((r) => r.unwrap())

    const mergedCommit2 = await mergeCommit(commit2).then((r) => r.unwrap())
    expect(mergedCommit2.version).toBe(2)
  })

  describe('commitPublished event', () => {
    it('publishes event with created document', async (ctx) => {
      const { project, workspace, user, providers } =
        await ctx.factories.createProject()
      const { commit } = await ctx.factories.createDraft({ project, user })

      await createNewDocument({
        user,
        workspace,
        commit,
        path: 'new-doc',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
        }),
      })

      vi.mocked(publisherModule.publisher.publishLater).mockClear()
      const result = await mergeCommit(commit)

      expect(result.ok).toBe(true)

      await waitForTransactionCallbacks()

      const calls = vi.mocked(publisherModule.publisher.publishLater).mock.calls
      const commitPublishedCall = calls.find(
        (call) => call[0].type === 'commitPublished',
      )
      expect(commitPublishedCall).toBeDefined()
      expect(commitPublishedCall![0].data.changedDocuments).toEqual([
        { path: 'new-doc', changeType: ModifiedDocumentType.Created },
      ])
    })

    it('publishes event with updated document', async (ctx) => {
      const { project, user, documents, providers } =
        await ctx.factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            'existing-doc': ctx.factories.helpers.createPrompt({
              provider: 'openai',
              content: 'original content',
            }),
          },
        })

      const { commit } = await ctx.factories.createDraft({ project, user })

      await updateDocument({
        commit,
        document: documents[0]!,
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'updated content',
        }),
      })

      vi.mocked(publisherModule.publisher.publishLater).mockClear()
      await mergeCommit(commit).then((r) => r.unwrap())
      await waitForTransactionCallbacks()

      const calls = vi.mocked(publisherModule.publisher.publishLater).mock.calls
      const commitPublishedCall = calls.find(
        (call) => call[0].type === 'commitPublished',
      )
      expect(commitPublishedCall).toBeDefined()
      expect(commitPublishedCall![0].data.changedDocuments).toEqual([
        { path: 'existing-doc', changeType: ModifiedDocumentType.Updated },
      ])
    })

    it('publishes event with deleted document', async (ctx) => {
      const { project, user, workspace, documents } =
        await ctx.factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            'to-delete': ctx.factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const { commit } = await ctx.factories.createDraft({ project, user })

      const destroyResult = await destroyDocument({
        document: documents[0]!,
        commit,
        workspace,
      })
      expect(destroyResult.ok).toBe(true)

      vi.mocked(publisherModule.publisher.publishLater).mockClear()
      const mergeResult = await mergeCommit(commit)
      expect(mergeResult.ok).toBe(true)
      await waitForTransactionCallbacks()

      const calls = vi.mocked(publisherModule.publisher.publishLater).mock.calls
      const commitPublishedCall = calls.find(
        (call) => call[0].type === 'commitPublished',
      )
      expect(commitPublishedCall).toBeDefined()
      expect(commitPublishedCall![0].data.changedDocuments).toEqual([
        { path: 'to-delete', changeType: ModifiedDocumentType.Deleted },
      ])
    })

    it('publishes event with renamed document (updated path)', async (ctx) => {
      const { project, user, workspace, documents, providers } =
        await ctx.factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            'old-path': ctx.factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const { commit } = await ctx.factories.createDraft({ project, user })

      await destroyDocument({ document: documents[0]!, commit, workspace })
      await createNewDocument({
        user,
        workspace,
        commit,
        path: 'new-path',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
        }),
      })

      vi.mocked(publisherModule.publisher.publishLater).mockClear()
      await mergeCommit(commit).then((r) => r.unwrap())
      await waitForTransactionCallbacks()

      const calls = vi.mocked(publisherModule.publisher.publishLater).mock.calls
      const commitPublishedCall = calls.find(
        (call) => call[0].type === 'commitPublished',
      )
      expect(commitPublishedCall).toBeDefined()
      const changedDocs = commitPublishedCall![0].data.changedDocuments
      expect(changedDocs).toHaveLength(2)
      expect(changedDocs).toContainEqual({
        path: 'old-path',
        changeType: ModifiedDocumentType.Deleted,
      })
      expect(changedDocs).toContainEqual({
        path: 'new-path',
        changeType: ModifiedDocumentType.Created,
      })
    })

    it('publishes event with multiple document changes', async (ctx) => {
      const { project, user, workspace, documents, providers } =
        await ctx.factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            'doc-to-update': ctx.factories.helpers.createPrompt({
              provider: 'openai',
              content: 'original',
            }),
            'doc-to-delete': ctx.factories.helpers.createPrompt({
              provider: 'openai',
            }),
          },
        })

      const { commit } = await ctx.factories.createDraft({ project, user })

      await createNewDocument({
        user,
        workspace,
        commit,
        path: 'new-doc',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
        }),
      })

      await updateDocument({
        commit,
        document: documents.find((d) => d.path === 'doc-to-update')!,
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'updated',
        }),
      })

      await destroyDocument({
        document: documents.find((d) => d.path === 'doc-to-delete')!,
        commit,
        workspace,
      })

      vi.mocked(publisherModule.publisher.publishLater).mockClear()
      await mergeCommit(commit).then((r) => r.unwrap())
      await waitForTransactionCallbacks()

      const calls = vi.mocked(publisherModule.publisher.publishLater).mock.calls
      const commitPublishedCall = calls.find(
        (call) => call[0].type === 'commitPublished',
      )
      expect(commitPublishedCall).toBeDefined()
      const changedDocs = commitPublishedCall![0].data.changedDocuments
      expect(changedDocs).toHaveLength(3)
      expect(changedDocs).toContainEqual({
        path: 'new-doc',
        changeType: ModifiedDocumentType.Created,
      })
      expect(changedDocs).toContainEqual({
        path: 'doc-to-update',
        changeType: ModifiedDocumentType.Updated,
      })
      expect(changedDocs).toContainEqual({
        path: 'doc-to-delete',
        changeType: ModifiedDocumentType.Deleted,
      })
    })

    it('rejects merge when two drafts add a document at the same path', async (ctx) => {
      const { project, workspace, user, providers } =
        await ctx.factories.createProject()

      const { commit: draftA } = await ctx.factories.createDraft({
        project,
        user,
      })
      await createNewDocument({
        user,
        workspace,
        commit: draftA,
        path: 'shared/path',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'from-A',
        }),
      })
      await mergeCommit(draftA).then((r) => r.unwrap())

      const { commit: draftB } = await ctx.factories.createDraft({
        project,
        user,
      })
      await createNewDocument({
        user,
        workspace,
        commit: draftB,
        path: 'shared/path',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'from-B',
        }),
      })

      const result = await mergeCommit(draftB)
      expect(result.ok).toBe(false)
      expect((result.error as Error).message).toContain('shared/path')
      expect((result.error as Error).message).toContain(
        'more than one active document',
      )
    })

    it('allows merge when a draft deletes the existing document and adds a new one at the same path', async (ctx) => {
      const { project, user, workspace, documents, providers } =
        await ctx.factories.createProject({
          providers: [{ type: Providers.OpenAI, name: 'openai' }],
          documents: {
            recycle: ctx.factories.helpers.createPrompt({ provider: 'openai' }),
          },
        })

      const { commit } = await ctx.factories.createDraft({ project, user })

      await destroyDocument({
        document: documents.find((d) => d.path === 'recycle')!,
        commit,
        workspace,
      })

      await createNewDocument({
        user,
        workspace,
        commit,
        path: 'recycle',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
          content: 'replacement',
        }),
      })

      const result = await mergeCommit(commit)
      expect(result.ok).toBe(true)
    })

    it('publishes commitMerged event alongside commitPublished', async (ctx) => {
      const { project, workspace, user, providers } =
        await ctx.factories.createProject()
      const { commit } = await ctx.factories.createDraft({ project, user })

      await createNewDocument({
        user,
        workspace,
        commit,
        path: 'foo',
        content: ctx.factories.helpers.createPrompt({
          provider: providers[0]!,
        }),
      })

      vi.mocked(publisherModule.publisher.publishLater).mockClear()
      const mergedCommit = await mergeCommit(commit).then((r) => r.unwrap())
      await waitForTransactionCallbacks()

      const calls = vi.mocked(publisherModule.publisher.publishLater).mock.calls
      const commitMergedCall = calls.find(
        (call) => call[0].type === 'commitMerged',
      )
      const commitPublishedCall = calls.find(
        (call) => call[0].type === 'commitPublished',
      )

      expect(commitMergedCall).toBeDefined()
      expect(commitPublishedCall).toBeDefined()
      expect(commitPublishedCall![0].data.commit.id).toBe(mergedCommit.id)
      expect(commitPublishedCall![0].data.workspaceId).toBe(workspace.id)
      expect(commitPublishedCall![0].data.userEmail).toBe(user.email)
    })
  })
})

describe('reference-only parent documents across parallel versions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(publisherModule.publisher.publishLater).mockResolvedValue(
      undefined,
    )
  })

  // A parent prompt references a child via `<prompt path="..." />`. Editing the
  // child in a draft marks the parent as changed (its resolved content changes),
  // but the parent's OWN content must keep tracking Live until the draft is
  // actually merged. Otherwise the change list snapshots the parent into the
  // draft, and publishing the draft reverts any parallel change made to the
  // parent in the meantime.

  async function setupParentChild(ctx: TestContext) {
    return ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        child: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'CHILD_V1',
        }),
        parent: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: '<prompt path="child" />\nPARENT_V1',
        }),
      },
    })
  }

  it('does not revert a parallel Live change to the parent when publishing a draft that only changed the child', async (ctx) => {
    const { project, user, workspace, documents } = await setupParentChild(ctx)
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const child = documents.find((d) => d.path === 'child')!
    const parent = documents.find((d) => d.path === 'parent')!

    // Draft D: edit the child only
    const { commit: draftD } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit: draftD,
      document: child,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'CHILD_V2',
      }),
    }).then((r) => r.unwrap())

    // Listing the draft changes is what (today) snapshots the parent into the
    // draft as a frozen copy of its current content.
    await getCommitChanges({ workspace, commit: draftD }).then((r) => r.unwrap())

    // A parallel version is published to Live that changes the parent's OWN
    // content.
    const { commit: draftP } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit: draftP,
      document: parent,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: '<prompt path="child" />\nPARENT_V2',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(draftP).then((r) => r.unwrap())

    // Now publish draft D
    const mergedD = await mergeCommit(draftD).then((r) => r.unwrap())

    const docsAtMergedD = await docsScope
      .getDocumentsAtCommit(mergedD)
      .then((r) => r.unwrap())
    const mergedParent = docsAtMergedD.find((d) => d.path === 'parent')!
    const mergedChild = docsAtMergedD.find((d) => d.path === 'child')!

    // The parallel parent change must survive — it must NOT be reverted to V1.
    expect(mergedParent.content).toContain('PARENT_V2')
    expect(mergedParent.content).not.toContain('PARENT_V1')
    // The child change from draft D is applied.
    expect(mergedChild.content).toContain('CHILD_V2')
    // The parent's resolved content reflects the new child.
    expect(mergedParent.resolvedContent).toContain('CHILD_V2')
  })

  it('resolves the parent against current Live content inside a draft that only changed the child (no frozen snapshot)', async (ctx) => {
    const { project, user, workspace, documents } = await setupParentChild(ctx)
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const child = documents.find((d) => d.path === 'child')!
    const parent = documents.find((d) => d.path === 'parent')!

    const { commit: draftD } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit: draftD,
      document: child,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'CHILD_V2',
      }),
    }).then((r) => r.unwrap())

    // Snapshot trigger (change list)
    await getCommitChanges({ workspace, commit: draftD }).then((r) => r.unwrap())

    // Parallel Live change to the parent's own content
    const { commit: draftP } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit: draftP,
      document: parent,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: '<prompt path="child" />\nPARENT_V2',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(draftP).then((r) => r.unwrap())

    // Inside draft D (still unpublished), the parent must reflect the new Live
    // content, not a frozen V1 snapshot.
    const docsAtDraftD = await docsScope
      .getDocumentsAtCommit(draftD)
      .then((r) => r.unwrap())
    const draftParent = docsAtDraftD.find((d) => d.path === 'parent')!

    expect(draftParent.content).toContain('PARENT_V2')
    expect(draftParent.content).not.toContain('PARENT_V1')
  })

  it('does not revert a parallel Live change to a transitive (grandparent) reference', async (ctx) => {
    const { project, user, workspace, documents } =
      await ctx.factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          child: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: 'CHILD_V1',
          }),
          parent: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: '<prompt path="child" />\nPARENT_V1',
          }),
          grandparent: ctx.factories.helpers.createPrompt({
            provider: 'openai',
            content: '<prompt path="parent" />\nGRANDPARENT_V1',
          }),
        },
      })
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const child = documents.find((d) => d.path === 'child')!
    const grandparent = documents.find((d) => d.path === 'grandparent')!

    // Draft D: edit the child only
    const { commit: draftD } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit: draftD,
      document: child,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'CHILD_V2',
      }),
    }).then((r) => r.unwrap())

    // Snapshot trigger — freezes both parent and grandparent into the draft
    await getCommitChanges({ workspace, commit: draftD }).then((r) => r.unwrap())

    // Parallel Live change to the grandparent's own content
    const { commit: draftP } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit: draftP,
      document: grandparent,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: '<prompt path="parent" />\nGRANDPARENT_V2',
      }),
    }).then((r) => r.unwrap())
    await mergeCommit(draftP).then((r) => r.unwrap())

    const mergedD = await mergeCommit(draftD).then((r) => r.unwrap())

    const docsAtMergedD = await docsScope
      .getDocumentsAtCommit(mergedD)
      .then((r) => r.unwrap())
    const mergedGrandparent = docsAtMergedD.find(
      (d) => d.path === 'grandparent',
    )!

    expect(mergedGrandparent.content).toContain('GRANDPARENT_V2')
    expect(mergedGrandparent.content).not.toContain('GRANDPARENT_V1')
    expect(mergedGrandparent.resolvedContent).toContain('CHILD_V2')
  })

  it('still records the referencing parent as a change in the published version (history preserved)', async (ctx) => {
    const { project, user, workspace, documents } = await setupParentChild(ctx)
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const child = documents.find((d) => d.path === 'child')!

    const { commit: draftD } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit: draftD,
      document: child,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'CHILD_V2',
      }),
    }).then((r) => r.unwrap())

    const mergedD = await mergeCommit(draftD).then((r) => r.unwrap())

    const changes = await docsScope
      .listCommitChanges(mergedD)
      .then((r) => r.unwrap())
    const parentChange = changes.find((d) => d.path === 'parent')

    // The parent must still appear as a change in the published version so the
    // history reflects that its behaviour changed...
    expect(parentChange).toBeDefined()
    // ...with its resolved content reflecting the new child...
    expect(parentChange!.resolvedContent).toContain('CHILD_V2')
    // ...while its own content is unchanged.
    expect(parentChange!.content).toContain('PARENT_V1')
  })
})
