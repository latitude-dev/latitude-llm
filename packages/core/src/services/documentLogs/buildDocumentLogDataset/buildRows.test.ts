import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as factories from '../../../tests/factories'
import { FactoryCreateProjectReturn } from '../../../tests/factories'
import { Providers } from '@latitude-data/constants'
import { Column } from '../../../schema/models/datasets'
import { buildRows } from './buildRows'
import { ProviderOutput } from './findProviderOutputs'
import { DocumentLogWithMetadataAndError } from '../../../repositories'

let setup: FactoryCreateProjectReturn

describe('buildRows', async () => {
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

  describe('with valid log', async () => {
    let documentLog: DocumentLogWithMetadataAndError

    beforeEach(async () => {
      documentLog = await factories.createDocumentLogWithMetadataAndError({
        document: setup.documents[0]!,
        commit: setup.commit,
        parameters: {
          location: 'San Francisco',
          age: 25,
        },
        experimentId: undefined,
      })
    })

    it('build row successfully', async () => {
      const providerOutputs: Map<string, ProviderOutput> = new Map([
        [documentLog.uuid, { output: 'test', generatedAt: new Date() }],
      ])
      const columns: Column[] = [
        {
          identifier: 'location',
          name: 'location',
          role: 'parameter',
        },
        {
          identifier: 'id',
          name: 'id',
          role: 'metadata',
        },
        {
          identifier: 'createdAt',
          name: 'createdAt',
          role: 'metadata',
        },
        {
          identifier: 'output',
          name: 'output',
          role: 'label',
        },
      ]

      const result = buildRows([documentLog], providerOutputs, columns)

      expect(result).toStrictEqual([
        {
          location: 'San Francisco',
          id: documentLog.id,
          createdAt: documentLog.createdAt,
          output: 'test',
        },
      ])
    })

    it('build rows successfully with null field columns', async () => {
      const columns: Column[] = [
        {
          identifier: 'id',
          name: 'id',
          role: 'metadata',
        },
        {
          identifier: 'experimentId',
          name: 'experimentId',
          role: 'metadata',
        },
      ]

      const result = buildRows([documentLog], new Map(), columns)

      expect(result).toStrictEqual([
        {
          id: documentLog.id,
          experimentId: documentLog.experimentId,
        },
      ])
    })

    it('build rows successfully with nested field columns', async () => {
      const columns: Column[] = [
        {
          identifier: 'id',
          name: 'id',
          role: 'metadata',
        },
        {
          identifier: 'commitTitle',
          name: 'commit.title',
          role: 'metadata',
        },
      ]

      const result = buildRows([documentLog], new Map(), columns)

      expect(result).toStrictEqual([
        {
          id: documentLog.id,
          commitTitle: setup.commit.title,
        },
      ])
    })
  })

  describe('with unexpected metadata columns', async () => {
    it('buildRowSuccessfully', async () => {
      const documentLog = await factories.createDocumentLogWithMetadataAndError(
        {
          document: setup.documents[0]!,
          commit: setup.commit,
        },
      )
      const columns: Column[] = [
        {
          identifier: 'id',
          name: 'id',
          role: 'metadata',
        },
        {
          identifier: 'nonexisting',
          name: 'nonexisting',
          role: 'metadata',
        },
      ]

      const result = buildRows([documentLog], new Map(), columns)

      expect(result).toStrictEqual([
        {
          id: documentLog.id,
          nonexisting: null,
        },
      ])
    })
  })

  describe('with multiple logs with different parameters', async () => {
    it('build rows successfully', async () => {
      const oneDocumentLog =
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            speed: 100,
          },
        })
      const anotherDocumentLog =
        await factories.createDocumentLogWithMetadataAndError({
          document: setup.documents[0]!,
          commit: setup.commit,
          parameters: {
            brand: 'Latitude',
          },
        })
      const columns: Column[] = [
        {
          identifier: 'speed',
          name: 'speed',
          role: 'parameter',
        },
        {
          identifier: 'brand',
          name: 'brand',
          role: 'parameter',
        },
        {
          identifier: 'id',
          name: 'id',
          role: 'metadata',
        },
      ]

      const result = buildRows(
        [oneDocumentLog, anotherDocumentLog],
        new Map(),
        columns,
      )

      expect(result).toStrictEqual([
        {
          speed: 100,
          brand: null,
          id: oneDocumentLog.id,
        },
        {
          speed: null,
          brand: 'Latitude',
          id: anotherDocumentLog.id,
        },
      ])
    })
  })
})
