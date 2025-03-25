import { sum } from 'lodash-es'
import { describe, beforeAll, beforeEach, it, expect } from 'vitest'
import { Providers } from '@latitude-data/constants'
import * as factories from '../../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../../tests/factories'
import { identityHashAlgorithm } from '../../datasetsV2/utils'
import { buildDocumentLogDatasetRows } from './index'
import { ProviderLogsRepository } from '../../../repositories'
import { DatasetV2, DocumentLog, ErrorableEntity } from '../../../browser'
import getTestDisk from '../../../tests/testDrive'
import { RunErrorCodes } from '@latitude-data/constants/errors'

const testDrive = getTestDisk()
let setup: FactoryCreateProjectReturn
let documentLog: DocumentLog
let dataset: DatasetV2

describe('buildDocumentLogDatasetRows', async () => {
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
  })

  describe('with valid logs', () => {
    beforeEach(async () => {
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

    it('build correct dataset rows', async () => {
      const result = await buildDocumentLogDatasetRows({
        workspace: setup.workspace,
        documentLogIds: [documentLog.id],
        hashAlgorithm: identityHashAlgorithm,
      })

      const repo = new ProviderLogsRepository(setup.workspace.id)
      const providers = await repo.findManyByDocumentLogUuid([documentLog.uuid])
      const tokens = sum(providers.map((p) => p.tokens ?? 0))
      expect(result.value).toEqual({
        columns: [
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
        ],
        rows: [
          {
            age_identifier: 25,
            location_identifier: 'San Francisco',
            output_identifier: 'Last provider response. Hello!',
            document_log_id_identifier: documentLog.id,
            tokens_identifier: tokens,
          },
        ],
      })
    })

    it('set as columns parameters of all the document logs', async () => {
      const { documentLog: anotherDocumentLog } =
        await factories.createDocumentLog({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            nationality: 'Brazilian',
            age: 49,
          },
        })
      const result = await buildDocumentLogDatasetRows({
        workspace: setup.workspace,
        documentLogIds: [documentLog.id, anotherDocumentLog.id],
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(result.value).toEqual({
        columns: [
          {
            identifier: 'age_identifier',
            name: 'age',
            role: 'parameter',
          },
          {
            identifier: 'nationality_identifier',
            name: 'nationality',
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
        ],
        rows: [
          {
            age_identifier: 49,
            nationality_identifier: 'Brazilian',
            output_identifier: expect.any(String),
            location_identifier: '',
            document_log_id_identifier: anotherDocumentLog.id,
            tokens_identifier: expect.any(Number),
          },
          {
            age_identifier: 25,
            location_identifier: 'San Francisco',
            nationality_identifier: '',
            output_identifier: 'Last provider response. Hello!',
            document_log_id_identifier: documentLog.id,
            tokens_identifier: expect.any(Number),
          },
        ],
      })
    })

    describe('with dataset', () => {
      beforeEach(async () => {
        dataset = await factories
          .createDatasetV2({
            disk: testDrive,
            workspace: setup.workspace,
            author: setup.user,
            hashAlgorithm: identityHashAlgorithm,
            fileContent: `
        age,name,surname
        32,Paco,Merlo
        58,Frank,Merlo
      `,
          })
          .then((r) => r.dataset)
      })

      it('build correct dataset rows', async () => {
        const result = await buildDocumentLogDatasetRows({
          workspace: setup.workspace,
          dataset,
          documentLogIds: [documentLog.id],
          hashAlgorithm: identityHashAlgorithm,
        })
        expect(result.value).toEqual({
          columns: [
            {
              identifier: 'age_identifier',
              name: 'age',
              role: 'parameter',
            },
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
            {
              identifier: 'tokens_identifier',
              name: 'tokens',
              role: 'metadata',
            },
          ],
          rows: [
            {
              age_identifier: 25,
              name_identifier: '',
              surname_identifier: '',
              location_identifier: 'San Francisco',
              output_identifier: 'Last provider response. Hello!',
              document_log_id_identifier: documentLog.id,
              tokens_identifier: expect.any(Number),
            },
          ],
        })
      })
    })
  })

  it('filter logs from other workspace', async () => {
    const another = await factories.createProject({
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
    const { documentLog: anotherWorkspaceLog } =
      await factories.createDocumentLog({
        document: another.documents[0]!,
        commit: another.commit,
      })
    const result = await buildDocumentLogDatasetRows({
      workspace: setup.workspace,
      documentLogIds: [anotherWorkspaceLog.id],
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.value).toEqual({
      columns: [
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
        {
          identifier: 'tokens_identifier',
          name: 'tokens',
          role: 'metadata',
        },
      ],
      rows: [],
    })
  })

  it('filter logs with errors', async () => {
    const { documentLog: logWithErrors } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      parameters: {
        location: 'San Francisco',
        age: 25,
      },
    })
    await factories.createRunError({
      errorableType: ErrorableEntity.DocumentLog,
      errorableUuid: logWithErrors.uuid,
      code: RunErrorCodes.Unknown,
      message: 'Error message',
    })
    const result = await buildDocumentLogDatasetRows({
      workspace: setup.workspace,
      documentLogIds: [logWithErrors.id],
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.value).toEqual({
      columns: [
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
        {
          identifier: 'tokens_identifier',
          name: 'tokens',
          role: 'metadata',
        },
      ],
      rows: [],
    })
  })
})
