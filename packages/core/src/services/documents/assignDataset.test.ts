import { beforeAll, describe, expect, it } from 'vitest'

import { Dataset, DocumentVersion } from '../../browser'
import { DatasetVersion, Providers } from '../../constants'
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
    doc1 = setup.documents.find((d) => d.path === 'doc1')!
  })

  // TODO: Test Dataset V2
  describe('dataset V1', () => {
    beforeAll(async () => {
      dataset = await factories
        .createDataset({
          name: 'Test Dataset',
          workspace: setup.workspace,
          author: setup.user,
        })
        .then((r) => r.dataset)
    })

    // FIXME: WHY IS THIS FAILING?
    it.skip('assign dataset to a merged document', async () => {
      const updatedDoc = await assignDataset({
        dataset,
        document: doc1,
        datasetVersion: DatasetVersion.V1,
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
        document: draftDoc1,
        dataset,
        datasetVersion: DatasetVersion.V1,
      }).then((r) => r.unwrap())

      expect(updatedDoc.datasetId).toBe(dataset.id)
    })
  })
})
