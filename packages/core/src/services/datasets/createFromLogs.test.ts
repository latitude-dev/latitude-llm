import { describe, beforeAll, it, expect } from 'vitest'
import * as factories from '../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../tests/factories'
import { Providers } from '@latitude-data/constants'
import getTestDisk from '../../tests/testDrive'
import { Dataset, DocumentLog } from '../../browser'
import { identityHashAlgorithm } from './utils'
import { createDatasetFromLogs } from './createFromLogs'
import { DatasetRowsRepository } from '../../repositories'

const testDrive = getTestDisk()
let setup: FactoryCreateProjectReturn
let dataset: Dataset
let documentLog: DocumentLog
describe('createFromLogs', async () => {
  beforeAll(async () => {
    setup = await factories.createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        foo: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })
    const { documentLog: dl } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      parameters: {
        location: 'San Francisco',
        age: 25,
      },
      automaticProvidersGeneratedAt: new Date(2022, 1, 1),
    })
    documentLog = dl
    await factories.createProviderLog({
      workspace: setup.workspace,
      documentLogUuid: documentLog.uuid,
      providerId: setup.providers[0]!.id,
      providerType: Providers.OpenAI,
      responseText: 'Last provider response. Hello!',
    })
  })

  it('creates a new dataset from logs', async () => {
    const result = await createDatasetFromLogs({
      author: setup.user,
      workspace: setup.workspace,
      data: {
        name: 'my-dataset-from-logs',
        documentLogIds: [documentLog.id],
      },
      hashAlgorithm: identityHashAlgorithm,
    })

    const dataset = result.value!
    expect(dataset.columns).toEqual([
      {
        identifier: 'age_identifier',
        name: 'age',
        role: 'parameter',
      },
      {
        identifier: 'location_identifier',
        name: 'location',
        role: 'parameter',
      },
      {
        identifier: 'output_identifier',
        name: 'output',
        role: 'label',
      },
      {
        identifier: 'document_log_id_identifier',
        name: 'document_log_id',
        role: 'metadata',
      },
      { identifier: 'tokens_identifier', name: 'tokens', role: 'metadata' },
    ])
    const repo = new DatasetRowsRepository(setup.workspace.id)
    const rows = await repo.findByDatasetPaginated({
      datasetId: dataset.id,
      page: '1',
      pageSize: '100',
    })
    expect(rows.map((r) => r.rowData)).toEqual([
      {
        age_identifier: 25,
        location_identifier: 'San Francisco',
        output_identifier: 'Last provider response. Hello!',
        document_log_id_identifier: documentLog.id,
        tokens_identifier: expect.any(Number),
      },
    ])
  })

  it('insert rows in an existing dataset', async () => {
    dataset = await factories
      .createDataset({
        disk: testDrive,
        workspace: setup.workspace,
        author: setup.user,
        hashAlgorithm: identityHashAlgorithm,
        fileContent: `
        name,surname
        Paco,Merlo
        Frank,Merlo
      `,
      })
      .then((r) => r.dataset)
    const result = await createDatasetFromLogs({
      author: setup.user,
      workspace: setup.workspace,
      data: {
        name: dataset.name,
        documentLogIds: [documentLog.id],
      },
      hashAlgorithm: identityHashAlgorithm,
    })
    const updatedDataset = result.value!
    expect(updatedDataset.columns).toEqual([
      {
        identifier: 'name_identifier',
        name: 'name',
        role: 'parameter',
      },
      {
        identifier: 'surname_identifier',
        name: 'surname',
        role: 'parameter',
      },
      {
        identifier: 'age_identifier',
        name: 'age',
        role: 'parameter',
      },
      {
        identifier: 'location_identifier',
        name: 'location',
        role: 'parameter',
      },
      {
        identifier: 'output_identifier',
        name: 'output',
        role: 'label',
      },
      {
        identifier: 'document_log_id_identifier',
        name: 'document_log_id',
        role: 'metadata',
      },
      { identifier: 'tokens_identifier', name: 'tokens', role: 'metadata' },
    ])
    const repo = new DatasetRowsRepository(setup.workspace.id)
    const rows = await repo.findByDatasetPaginated({
      datasetId: updatedDataset.id,
      page: '1',
      pageSize: '100',
    })
    expect(rows.map((r) => r.rowData)).toEqual([
      {
        age_identifier: 25,
        location_identifier: 'San Francisco',
        output_identifier: 'Last provider response. Hello!',
        name_identifier: '',
        document_log_id_identifier: documentLog.id,
        surname_identifier: '',
        tokens_identifier: expect.any(Number),
      },
      {
        name_identifier: 'Frank',
        surname_identifier: 'Merlo',
      },
      {
        name_identifier: 'Paco',
        surname_identifier: 'Merlo',
      },
    ])
  })
})
