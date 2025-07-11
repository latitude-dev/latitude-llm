import { describe, expect, it, vi } from 'vitest'
import * as factories from '../../../../../tests/factories'
import { createNewDocument, updateDocument } from '../../../../documents'
import { DocumentVersionsRepository } from '../../../../../repositories'
import { LatteEditAction, LatteTool } from '@latitude-data/constants/latte'
import { LATTE_TOOLS } from '../../tools'
import { createLatteThread } from '../createThread'
import { undoLatteThreadChanges } from './undoChanges'
import { DocumentVersion } from '../../../../../browser'
import { WebsocketClient } from '../../../../../websockets/workers'
import { deleteCommitDraft } from '../../../../commits'

vi.spyOn(WebsocketClient, 'sendEvent').mockImplementation(vi.fn())

const expectPrompt = (
  documents: DocumentVersion[],
  path: string,
  { content, deletedAt }: { content: string; deletedAt: Date | null },
) => {
  const doc = documents.find((d) => d.path === path)
  expect(doc).toBeDefined()
  expect(doc!.content).toEqual(content)
  expect(doc!.deletedAt).toEqual(deletedAt)
}

describe('undo latte changes', () => {
  it('reverts the state from thread checkpoints', async () => {
    /*
    INITIAL COMMIT:
      [ + ] delete/edited: THIS TEXT SHOULD NOT BE HERE
      [ + ] delete/unedited: This prompt should not appear in the draft changes.
      [ + ] update/edited: THIS TEXT SHOULD NOT BE HERE
      [ + ] update/unedited: This prompt should not appear in the draft changes.
    */
    const { workspace, documents, project, user } =
      await factories.createProject({
        documents: {
          'delete/edited': 'THIS TEXT SHOULD NOT BE HERE',
          'delete/unedited':
            'This prompt should not appear in the draft changes.',
          'update/edited': 'THIS TEXT SHOULD NOT BE HERE',
          'update/unedited':
            'This prompt should not appear in the draft changes.',
        },
      })

    /*
    DRAFT INITIAL STATE:
      [ · ] delete/edited: This prompt should appear in the draft changes, as an "update", and without Latte's sign.
      [ + ] delete/new: This prompt should appear in the draft changes, as "new", and without Latte's sign.
      [ · ] update/edited: This prompt should appear in the draft changes, as "delete", but without Latte's sign.
      [ + ] update/new: This prompt should appear in the draft changes, as "new", but without Latte's sign.
    */
    const { commit: draft } = await factories.createDraft({ project, user })
    await createNewDocument({
      workspace,
      commit: draft,
      path: 'delete/new',
      content:
        'This prompt should appear in the draft changes, as "new", and without Latte\'s sign.',
      includeDefaultContent: false,
    }).then((r) => r.unwrap())
    await updateDocument({
      commit: draft,
      document: documents.find((doc) => doc.path === 'delete/edited')!,
      content:
        'This prompt should appear in the draft changes, as an "update", and without Latte\'s sign.',
    }).then((r) => r.unwrap())
    await createNewDocument({
      workspace,
      commit: draft,
      path: 'update/new',
      content:
        'This prompt should appear in the draft changes, as "new", and without Latte\'s sign.',
      includeDefaultContent: false,
    }).then((r) => r.unwrap())
    await updateDocument({
      commit: draft,
      document: documents.find((doc) => doc.path === 'update/edited')!,
      content:
        'This prompt should appear in the draft changes, as an "update", but without Latte\'s sign.',
    }).then((r) => r.unwrap())

    /*
    LATTE ACTIONS: 
      [ + ] create/new: Latte was here
      [ · ] update/new: (...) + Latte was here
      [ · ] update/edited: (...) + Latte was here
      [ · ] update/unedited: (...) + Latte was here
      [ - ] delete/new
      [ - ] delete/edited
      [ - ] delete/unedited
    */
    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const documentsBeforeActions = await documentsScope
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())
    const actions: LatteEditAction[] = [
      {
        type: 'prompt',
        operation: 'create',
        path: 'create/new',
        content: 'Latte was here',
      },
      ...documentsBeforeActions.map((doc) => {
        if (doc.path.startsWith('update/')) {
          return {
            type: 'prompt',
            operation: 'update',
            promptUuid: doc.documentUuid,
            content: `${doc.content}\nLatte was here`,
          } as LatteEditAction
        }
        return {
          type: 'prompt',
          operation: 'delete',
          promptUuid: doc.documentUuid,
        } as LatteEditAction
      }),
    ]

    const thread = await createLatteThread({ user, workspace }).then((r) =>
      r.unwrap(),
    )

    await LATTE_TOOLS[LatteTool.editProject](
      {
        projectId: project.id,
        draftUuid: draft.uuid,
        actions,
      },
      {
        workspace,
        threadUuid: thread.uuid,
        // @ts-ignore
        tool: {
          name: LatteTool.editProject,
        },
      },
    ).then((r) => r.unwrap())

    /*
    DRAFT STATE AFTER LATTE ACTIONS: 
      [ + ] create/new: Latte was here
      [ + ] update/new: (...) + Latte was here <-- appears as "new" because it was created in the draft
      [ · ] update/edited: (...) + Latte was here
      [ · ] update/unedited: (...) + Latte was here
      [ - ] delete/edited
      [ - ] delete/unedited
      [ - ] delete/new
    */

    const changesAfterLatte = await documentsScope
      .listCommitChanges(draft)
      .then((r) => r.unwrap())

    expect(changesAfterLatte.length).toEqual(7)
    expectPrompt(changesAfterLatte, 'create/new', {
      content: 'Latte was here',
      deletedAt: null,
    })
    expectPrompt(changesAfterLatte, 'update/new', {
      content:
        'This prompt should appear in the draft changes, as "new", and without Latte\'s sign.\nLatte was here',
      deletedAt: null,
    })
    expectPrompt(changesAfterLatte, 'update/edited', {
      content:
        'This prompt should appear in the draft changes, as an "update", but without Latte\'s sign.\nLatte was here',
      deletedAt: null,
    })
    expectPrompt(changesAfterLatte, 'update/unedited', {
      content:
        'This prompt should not appear in the draft changes.\nLatte was here',
      deletedAt: null,
    })
    expectPrompt(changesAfterLatte, 'delete/edited', {
      content:
        'This prompt should appear in the draft changes, as an "update", and without Latte\'s sign.', // <-- the "edition" is not present, as it was deleted
      deletedAt: expect.any(Date),
    })
    expectPrompt(changesAfterLatte, 'delete/unedited', {
      content: 'This prompt should not appear in the draft changes.', // <-- the "edition" is not present, as it was deleted
      deletedAt: expect.any(Date),
    })
    expectPrompt(changesAfterLatte, 'delete/new', {
      content:
        'This prompt should appear in the draft changes, as "new", and without Latte\'s sign.', // <-- this prompt was created in the draft, so it is not deleted
      deletedAt: expect.any(Date),
    })

    /*
    DRAFT STATE AFTER UNDO: SAME AS INITIAL STATE
      [ · ] delete/edited: This prompt should appear in the draft changes, as an "update", and without Latte's sign.
      [ + ] delete/new: This prompt should appear in the draft changes, as "new", and without Latte's sign.
      [ · ] update/edited: This prompt should appear in the draft changes, as an "update", but without Latte's sign.
      [ + ] update/new: This prompt should appear in the draft changes, as "new", but without Latte's sign.
    */
    await undoLatteThreadChanges({ workspace, threadUuid: thread.uuid })
    const changesAfterUndo = await documentsScope
      .listCommitChanges(draft)
      .then((r) => r.unwrap())
    expect(changesAfterUndo.length).toEqual(4)
    expectPrompt(changesAfterUndo, 'delete/edited', {
      content:
        'This prompt should appear in the draft changes, as an "update", and without Latte\'s sign.',
      deletedAt: null,
    })
    expectPrompt(changesAfterUndo, 'delete/new', {
      content:
        'This prompt should appear in the draft changes, as "new", and without Latte\'s sign.',
      deletedAt: null,
    })
    expectPrompt(changesAfterUndo, 'update/edited', {
      content:
        'This prompt should appear in the draft changes, as an "update", but without Latte\'s sign.',
      deletedAt: null,
    })
    expectPrompt(changesAfterUndo, 'update/new', {
      content:
        'This prompt should appear in the draft changes, as "new", and without Latte\'s sign.',
      deletedAt: null,
    })
  })

  describe('unrevertable changes', () => {
    it('does not fail when the draft has been deleted', async () => {
      const { workspace, project, user } = await factories.createProject({
        documents: {
          foo: 'bar',
        },
      })

      const { commit: draft } = await factories.createDraft({ project, user })
      const thread = await createLatteThread({ user, workspace }).then((r) =>
        r.unwrap(),
      )
      await LATTE_TOOLS[LatteTool.editProject](
        {
          projectId: project.id,
          draftUuid: draft.uuid,
          actions: [
            {
              type: 'prompt',
              operation: 'create',
              promptUuid: 'foo',
              path: 'bar',
              content: 'baz',
            },
          ],
        },
        {
          workspace,
          threadUuid: thread.uuid,
          // @ts-ignore
          tool: {
            name: LatteTool.editProject,
          },
        },
      )

      await deleteCommitDraft(draft).then((r) => r.unwrap())

      const result = await undoLatteThreadChanges({
        workspace,
        threadUuid: thread.uuid,
      })
      expect(result.ok).toBe(true)
    })
  })
})
