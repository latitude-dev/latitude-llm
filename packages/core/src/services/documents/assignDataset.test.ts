import { beforeAll, describe, expect, it } from 'vitest'

import { Dataset, DocumentVersion } from '../../browser'
import { Providers } from '../../constants'
import { NotFoundError } from '../../lib'
import * as factories from '../../tests/factories'
import { assignDataset } from './assignDataset'
import { updateDocument } from './update'

let setup: Awaited<ReturnType<typeof factories.createProject>>
let doc1: DocumentVersion
let dataset: Dataset
describe('assignDataset', () => {
  beforeAll(async () => {
    setup = await factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Doc 1',
        }),
      },
    })
    dataset = await factories
      .createDataset({
        name: 'Test Dataset',
        workspace: setup.workspace,
        author: setup.user,
      })
      .then((r) => r.dataset)
    doc1 = setup.documents.find((d) => d.path === 'doc1')!
  })

  it('assign dataset to a merge document', async () => {
    const updatedDoc = await assignDataset({
      workspace: setup.workspace,
      commit: setup.commit,
      dataset,
      documentUuid: doc1.documentUuid,
    }).then((r) => r.unwrap())

    expect(updatedDoc.datasetId).toBe(dataset.id)
  })

  it('assign dataset to a draft document', async () => {
    const { commit: draft } = await factories.createDraft({
      project: setup.project,
      user: setup.user,
    })
    const draftDoc1 = await updateDocument({
      commit: draft,
      document: doc1,
      content: factories.helpers.createPrompt({
        provider: 'openai',
        content: 'Doc 1 commit 2',
      }),
    }).then((r) => r.unwrap())

    const updatedDoc = await assignDataset({
      workspace: setup.workspace,
      commit: draft,
      documentUuid: draftDoc1.documentUuid,
      dataset,
    }).then((r) => r.unwrap())

    expect(updatedDoc.datasetId).toBe(dataset.id)
  })

  it('return error when document not found', async () => {
    const result = await assignDataset({
      workspace: setup.workspace,
      commit: setup.commit,
      dataset,
      documentUuid: 'not-found',
    })
    expect(result.error).toEqual(new NotFoundError('Document does not exist'))
  })
})
