import { beforeEach, describe, expect, it } from 'vitest'

import { Dataset, DocumentVersion } from '../../browser'
import { Providers } from '../../constants'
import * as factories from '../../tests/factories'
import { saveLinkedDataset } from './saveLinkedDataset'
import { DocumentVersionsRepository } from '../../repositories'

let setup: Awaited<ReturnType<typeof factories.createProject>>
let doc1: DocumentVersion
let dataset: Dataset

describe('saveLinkedDataset', () => {
  beforeEach(async () => {
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

    const repo = new DocumentVersionsRepository(setup.workspace.id)
    doc1 = await repo
      .getDocumentByPath({
        commit: setup.commit,
        path: 'doc1',
      })
      .then((r) => r.unwrap())
  })

  it('assign dataset to a merged document', async () => {
    const updatedDoc = await saveLinkedDataset({
      dataset,
      document: doc1,
      data: {
        rowIndex: 0,
        inputs: {
          input1: {
            value: 'value1',
            metadata: { includeInPrompt: true },
          },
          input2: {
            value: 'value2',
            metadata: { includeInPrompt: true },
          },
        },
        mappedInputs: {
          input1: 0,
          input2: 1,
        },
      },
    }).then((r) => r.unwrap())

    expect(updatedDoc.linkedDataset).toEqual({
      [dataset.id]: {
        rowIndex: 0,
        inputs: {
          input1: {
            value: 'value1',
            metadata: { includeInPrompt: true },
          },
          input2: {
            value: 'value2',
            metadata: { includeInPrompt: true },
          },
        },
        mappedInputs: {
          input1: 0,
          input2: 1,
        },
      },
    })
  })

  it('preserve prev configuration', async () => {
    const updatedDoc = await saveLinkedDataset({
      dataset,
      document: doc1,
      data: {
        rowIndex: 0,
        inputs: {
          input1: {
            value: 'value1',
            metadata: { includeInPrompt: true },
          },
          input2: {
            value: 'value2',
            metadata: { includeInPrompt: true },
          },
        },
        mappedInputs: {
          input1: 0,
          input2: 1,
        },
      },
    }).then((r) => r.unwrap())
    const secondDataset = await factories
      .createDataset({
        name: 'Test Dataset 2',
        workspace: setup.workspace,
        author: setup.user,
      })
      .then((r) => r.dataset)

    const updatedDocSecondTime = await saveLinkedDataset({
      dataset: secondDataset,
      document: updatedDoc,
      data: {
        rowIndex: 0,
        inputs: {
          input1: {
            value: 'value2',
            metadata: { includeInPrompt: true },
          },
          input2: {
            value: 'value1',
            metadata: { includeInPrompt: true },
          },
        },
        mappedInputs: {
          input1: 1,
          input2: 0,
        },
      },
    }).then((r) => r.unwrap())

    expect(updatedDocSecondTime.linkedDataset).toEqual({
      [dataset.id]: {
        rowIndex: 0,
        inputs: {
          input1: {
            value: 'value1',
            metadata: { includeInPrompt: true },
          },
          input2: {
            value: 'value2',
            metadata: { includeInPrompt: true },
          },
        },
        mappedInputs: {
          input1: 0,
          input2: 1,
        },
      },
      [secondDataset.id]: {
        rowIndex: 0,
        inputs: {
          input1: {
            value: 'value2',
            metadata: { includeInPrompt: true },
          },
          input2: {
            value: 'value1',
            metadata: { includeInPrompt: true },
          },
        },
        mappedInputs: {
          input1: 1,
          input2: 0,
        },
      },
    })
  })
})
