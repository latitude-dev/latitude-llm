import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as factories from '../../../tests/factories'
import { FactoryCreateProjectReturn } from '../../../tests/factories'
import { Providers } from '@latitude-data/constants'
import { Column } from '../../../schema/models/datasets'
import { buildRows } from './buildRows'
import { ProviderOutput } from './findProviderOutputs'
import { DocumentLogWithMetadataAndError } from '../../../repositories'

let setup: FactoryCreateProjectReturn
let documentLog: DocumentLogWithMetadataAndError

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

  describe('withValidLogs', async () => {
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

    it('buildRowsSuccessfully', async () => {
      const expectedOutput: Map<string, ProviderOutput> = new Map([
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
          identifier: 'commit_title',
          name: 'commit.title',
          role: 'metadata',
        },
        {
          identifier: 'output',
          name: 'output',
          role: 'label',
        },
      ]

      const result = buildRows([documentLog], expectedOutput, columns)

      expect(result).toStrictEqual([
        {
          location: 'San Francisco',
          id: documentLog.id,
          commit_title: setup.commit.title,
          output: 'test',
        },
      ])
    })
  })
})
