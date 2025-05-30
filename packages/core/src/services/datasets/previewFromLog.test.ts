import { describe, beforeAll, it, expect } from 'vitest'
import { Providers } from '@latitude-data/constants'
import * as factories from '../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../tests/factories'
import { previewDatasetFromLogs } from './previewFromLogs'
import { identityHashAlgorithm } from './utils'

let setup: FactoryCreateProjectReturn

describe('previewDatasetFromLog', async () => {
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

  describe('without dataset', async () => {
    it('should return correct result with column filters', async () => {
      const documentLog = await factories.createDocumentLogWithMetadataAndError(
        {
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            foo: 'foo',
          },
        },
      )

      const result = await previewDatasetFromLogs({
        workspace: setup.workspace,
        data: {
          name: '',
          documentLogIds: [documentLog.id],
          columnFilters: {
            staticColumnNames: ['id'],
          },
        },
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(result.value).toEqual({
        columns: [
          {
            identifier: 'foo_identifier',
            name: 'foo',
            role: 'parameter',
          },
          {
            identifier: 'id_identifier',
            name: 'id',
            role: 'metadata',
          },
        ],
        existingRows: [],
        newRows: [
          {
            foo_identifier: documentLog.parameters.foo,
            id_identifier: documentLog.id,
          },
        ],
      })
    })

    it('should return relevant logs with different parameters', async () => {
      const olderLogWithParameters =
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            age: 25,
          },
        })
      const newerLogWithParameters =
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            age: 30,
          },
        })
      const logWithDifferentParameters =
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            city: 'Barcelona',
          },
        })

      const result = await previewDatasetFromLogs({
        workspace: setup.workspace,
        data: {
          name: '',
          documentLogIds: [
            olderLogWithParameters.id,
            newerLogWithParameters.id,
            logWithDifferentParameters.id,
          ],
          columnFilters: {
            staticColumnNames: ['id'],
          },
        },
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(result.value).toEqual({
        columns: expect.arrayContaining([
          {
            identifier: 'age_identifier',
            name: 'age',
            role: 'parameter',
          },
          {
            identifier: 'city_identifier',
            name: 'city',
            role: 'parameter',
          },
          {
            identifier: 'id_identifier',
            name: 'id',
            role: 'metadata',
          },
        ]),
        existingRows: [],
        newRows: expect.arrayContaining([
          {
            age_identifier: newerLogWithParameters.parameters.age,
            city_identifier: null,
            id_identifier: newerLogWithParameters.id,
          },
          {
            age_identifier: null,
            city_identifier: logWithDifferentParameters.parameters.city,
            id_identifier: logWithDifferentParameters.id,
          },
        ]),
      })
    })
  })

  describe('with dataset', async () => {
    it('should merge dataset columns and log parameters', async () => {
      const testDrive = (await import('../../tests/testDrive')).default()
      const datasetName = 'test-dataset'
      await factories
        .createDataset({
          disk: testDrive,
          workspace: setup.workspace,
          author: setup.user,
          hashAlgorithm: identityHashAlgorithm,
          name: datasetName,
          fileContent: `
            model,provider,year
            gpt-3,openai,2020
            llama-2,meta,2023
          `,
        })
        .then((r) => r.dataset)
      const documentLog = await factories.createDocumentLogWithMetadataAndError(
        {
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            model: 'gemini-1.5',
            provider: 'google',
            year: 2024,
          },
        },
      )

      const result = await previewDatasetFromLogs({
        workspace: setup.workspace,
        data: {
          name: datasetName,
          documentLogIds: [documentLog.id],
          columnFilters: {
            staticColumnNames: ['id'],
          },
        },
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(result.value!.columns).toEqual(
        expect.arrayContaining([
          {
            identifier: 'model_identifier',
            name: 'model',
            role: 'parameter',
          },
          {
            identifier: 'provider_identifier',
            name: 'provider',
            role: 'parameter',
          },
          {
            identifier: 'year_identifier',
            name: 'year',
            role: 'parameter',
          },
          {
            identifier: 'id_identifier',
            name: 'id',
            role: 'metadata',
          },
        ]),
      )

      expect(result.value!.existingRows).toEqual(
        expect.arrayContaining([
          {
            model_identifier: 'gpt-3',
            provider_identifier: 'openai',
            year_identifier: 2020,
          },
          {
            model_identifier: 'llama-2',
            provider_identifier: 'meta',
            year_identifier: 2023,
          },
        ]),
      )

      expect(result.value!.newRows).toEqual(
        expect.arrayContaining([
          {
            model_identifier: documentLog.parameters.model,
            provider_identifier: documentLog.parameters.provider,
            year_identifier: documentLog.parameters.year,
            id_identifier: documentLog.id,
          },
        ]),
      )
    })
  })
})
