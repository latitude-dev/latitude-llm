import { beforeAll, describe, expect, it } from 'vitest'
import { buildColumns, DEFAULT_STATIC_COLUMNS } from './buildColumns'
import { DATASET_COLUMN_ROLES, DEFAULT_DATASET_LABEL } from '../../../browser'
import { type DocumentLogWithMetadataAndError } from '../../../repositories'
import { type Dataset } from '../../../browser'
import * as factories from '../../../tests/factories'
import { identityHashAlgorithm } from '../../datasets/utils'
import { Providers } from '@latitude-data/constants'
import { FactoryCreateProjectReturn } from '../../../tests/factories'

let setup: FactoryCreateProjectReturn

describe('buildColumns', async () => {
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
    let logs: DocumentLogWithMetadataAndError[]

    beforeAll(async () => {
      logs = [
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: { foo: 1, bar: 2 },
        }),
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: { bar: 3, baz: 4 },
        }),
      ]
    })

    it('returns parameters and default static columns from logs without columnFilters', () => {
      const paramNames = ['foo', 'bar', 'baz']
      const staticNames = DEFAULT_STATIC_COLUMNS

      const columns = buildColumns({
        logs,
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(columns).toHaveLength(paramNames.length + staticNames.length)
      paramNames.forEach((name) => {
        expect(columns).toContainEqual(
          expect.objectContaining({
            name,
            role: DATASET_COLUMN_ROLES.parameter,
          }),
        )
      })
      staticNames.forEach((name) => {
        expect(columns).toContainEqual(
          expect.objectContaining({
            name,
            role:
              name === DEFAULT_DATASET_LABEL
                ? DATASET_COLUMN_ROLES.label
                : DATASET_COLUMN_ROLES.metadata,
          }),
        )
      })
    })

    it('uses parameterColumnNames and staticColumnNames from columnFilters', () => {
      const columns = buildColumns({
        logs,
        hashAlgorithm: identityHashAlgorithm,
        columnFilters: {
          parameterColumnNames: ['foo'],
          staticColumnNames: ['output', 'id'],
        },
      })

      expect(columns).toHaveLength(3)
      expect(columns).toEqual([
        expect.objectContaining({
          name: 'foo',
          role: DATASET_COLUMN_ROLES.parameter,
        }),
        expect.objectContaining({
          name: 'output',
          role: DATASET_COLUMN_ROLES.label,
        }),
        expect.objectContaining({
          name: 'id',
          role: DATASET_COLUMN_ROLES.metadata,
        }),
      ])
    })
  })

  describe('with dataset columns', () => {
    it('merges dataset columns with new columns', async () => {
      const logs = [
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: { foo: 1 },
        }),
      ]
      const dataset: Dataset = {
        columns: [
          {
            name: 'foo',
            role: DATASET_COLUMN_ROLES.parameter,
          },
          {
            name: 'otherParameter',
            role: DATASET_COLUMN_ROLES.parameter,
          },
          {
            name: 'metadata',
            role: DATASET_COLUMN_ROLES.metadata,
          },
        ],
      } as Dataset

      const columns = buildColumns({
        logs,
        hashAlgorithm: identityHashAlgorithm,
        dataset,
        columnFilters: {
          staticColumnNames: ['id'],
        },
      })

      expect(columns).toEqual([
        expect.objectContaining({
          name: 'foo',
          role: DATASET_COLUMN_ROLES.parameter,
        }),
        expect.objectContaining({
          name: 'otherParameter',
          role: DATASET_COLUMN_ROLES.parameter,
        }),
        expect.objectContaining({
          name: 'metadata',
          role: DATASET_COLUMN_ROLES.metadata,
        }),
        expect.objectContaining({
          name: 'id',
          role: DATASET_COLUMN_ROLES.metadata,
        }),
      ])
    })
  })

  describe('with logs with no parameters', () => {
    it('returns only static columns if logs have no parameters', async () => {
      const staticNames = DEFAULT_STATIC_COLUMNS
      const logs = [
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
        }),
      ]

      const columns = buildColumns({
        logs,
        hashAlgorithm: identityHashAlgorithm,
      })

      expect(columns.length).toBe(staticNames.length)
      staticNames.forEach((name) => {
        expect(columns).toContainEqual(expect.objectContaining({ name }))
      })
    })
  })
})
