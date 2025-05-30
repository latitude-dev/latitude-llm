import { describe, beforeAll, beforeEach, it, expect } from 'vitest'
import { Providers } from '@latitude-data/constants'
import * as factories from '../../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../../tests/factories'
import { identityHashAlgorithm } from '../../datasets/utils'
import { buildDocumentLogDataset, ColumnFilters } from './index'
import { DocumentLogWithMetadataAndError } from '../../../repositories'
import getTestDisk from '../../../tests/testDrive'
import { RunErrorCodes } from '@latitude-data/constants/errors'

const testDrive = getTestDisk()
let setup: FactoryCreateProjectReturn

describe('buildDocumentLogDataset', async () => {
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

  describe('without dataset', () => {
    let documentLog: DocumentLogWithMetadataAndError

    beforeEach(async () => {
      documentLog = await factories.createDocumentLogWithMetadataAndError({
        document: setup.documents[0]!,
        commit: setup.commit,
        parameters: {
          location: 'San Francisco',
          age: 25,
        },
        automaticProvidersGeneratedAt: new Date(2022, 1, 1),
      })
    })

    it('build correct log dataset without column filters', async () => {
      const result = await buildDocumentLogDataset({
        workspace: setup.workspace,
        documentLogIds: [documentLog.id],
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(result.value!.columns).toEqual(
        expect.arrayContaining([
          {
            identifier: 'location_identifier',
            name: 'location',
            role: 'parameter',
          },
          {
            identifier: 'age_identifier',
            name: 'age',
            role: 'parameter',
          },
          {
            identifier: 'output_identifier',
            name: 'output',
            role: 'label',
          },
          {
            identifier: 'id_identifier',
            name: 'id',
            role: 'metadata',
          },
          {
            identifier: 'tokens_identifier',
            name: 'tokens',
            role: 'metadata',
          },
        ]),
      )

      expect(result.value!.rows).toEqual([
        {
          age_identifier: documentLog.parameters.age,
          location_identifier: documentLog.parameters.location,
          output_identifier: expect.any(String),
          id_identifier: documentLog.id,
          tokens_identifier: documentLog.tokens,
        },
      ])
    })

    it('build correct log dataset with column filters', async () => {
      const filters: ColumnFilters = {
        parameterColumnNames: ['location'],
        staticColumnNames: ['id'],
      }
      const result = await buildDocumentLogDataset({
        workspace: setup.workspace,
        documentLogIds: [documentLog.id],
        hashAlgorithm: identityHashAlgorithm,
        columnFilters: filters,
      })

      expect(result.value!.columns).toEqual(
        expect.arrayContaining([
          {
            identifier: 'location_identifier',
            name: 'location',
            role: 'parameter',
          },
          {
            identifier: 'id_identifier',
            name: 'id',
            role: 'metadata',
          },
        ]),
      )

      expect(result.value!.rows).toEqual([
        {
          location_identifier: documentLog.parameters.location,
          id_identifier: documentLog.id,
        },
      ])
    })

    it('build correct log dataset with different parameter logs', async () => {
      const anotherDocumentLog =
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            nationality: 'Brazilian',
            age: 49,
          },
        })

      const result = await buildDocumentLogDataset({
        workspace: setup.workspace,
        documentLogIds: [documentLog.id, anotherDocumentLog.id],
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(result.value!.columns).toEqual(
        expect.arrayContaining([
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
            identifier: 'age_identifier',
            name: 'age',
            role: 'parameter',
          },
          {
            identifier: 'output_identifier',
            name: 'output',
            role: 'label',
          },
          {
            identifier: 'id_identifier',
            name: 'id',
            role: 'metadata',
          },
          {
            identifier: 'tokens_identifier',
            name: 'tokens',
            role: 'metadata',
          },
        ]),
      )

      expect(result.value!.rows).toEqual(
        expect.arrayContaining([
          {
            nationality_identifier: null,
            age_identifier: documentLog.parameters.age,
            location_identifier: documentLog.parameters.location,
            output_identifier: expect.any(String),
            id_identifier: documentLog.id,
            tokens_identifier: documentLog.tokens,
          },
          {
            nationality_identifier: anotherDocumentLog.parameters.nationality,
            age_identifier: anotherDocumentLog.parameters.age,
            location_identifier: null,
            output_identifier: expect.any(String),
            id_identifier: anotherDocumentLog.id,
            tokens_identifier: anotherDocumentLog.tokens,
          },
        ]),
      )
    })
  })

  describe('with previous dataset', () => {
    it('build correct log dataset with merged parameter columns', async () => {
      const dataset = await factories
        .createDataset({
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
      const documentLog = await factories.createDocumentLogWithMetadataAndError(
        {
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            age: 23,
          },
        },
      )

      const result = await buildDocumentLogDataset({
        workspace: setup.workspace,
        dataset,
        documentLogIds: [documentLog.id],
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(result.value!.columns).toEqual(
        expect.arrayContaining([
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
            identifier: 'output_identifier',
            name: 'output',
            role: 'label',
          },
          {
            identifier: 'id_identifier',
            name: 'id',
            role: 'metadata',
          },
          {
            identifier: 'tokens_identifier',
            name: 'tokens',
            role: 'metadata',
          },
        ]),
      )

      expect(result.value!.rows).toEqual(
        expect.arrayContaining([
          {
            age_identifier: documentLog.parameters.age,
            name_identifier: null,
            surname_identifier: null,
            output_identifier: expect.any(String),
            id_identifier: documentLog.id,
            tokens_identifier: documentLog.tokens,
          },
        ]),
      )
    })
  })

  describe('with logs from various wokspaces', () => {
    it('ignores logs from other workspaces', async () => {
      const anotherSetup = await factories.createProject({
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
      const anotherWorkspaceLog =
        await factories.createDocumentLogWithMetadataAndError({
          document: anotherSetup.documents[0]!,
          commit: anotherSetup.commit,
        })

      const result = await buildDocumentLogDataset({
        workspace: setup.workspace,
        documentLogIds: [anotherWorkspaceLog.id],
        hashAlgorithm: identityHashAlgorithm,
        columnFilters: {
          staticColumnNames: ['id'],
        },
      })

      expect(result.value).toEqual({
        columns: [
          {
            identifier: 'id_identifier',
            name: 'id',
            role: 'metadata',
          },
        ],
        rows: [],
      })
    })
  })

  it('filter logs with errors', async () => {
    const logWithError = await factories.createDocumentLogWithMetadataAndError({
      document: setup.documents[0]!,
      commit: setup.commit,
      parameters: {
        location: 'San Francisco',
        age: 25,
      },
      runError: {
        code: RunErrorCodes.Unknown,
        message: 'Error message',
      },
    })

    const result = await buildDocumentLogDataset({
      workspace: setup.workspace,
      documentLogIds: [logWithError.id],
      hashAlgorithm: identityHashAlgorithm,
      columnFilters: {
        staticColumnNames: ['id'],
      },
    })

    expect(result.value).toEqual({
      columns: [
        {
          identifier: 'id_identifier',
          name: 'id',
          role: 'metadata',
        },
      ],
      rows: [],
    })
  })
})
