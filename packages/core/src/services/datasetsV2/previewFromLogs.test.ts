import { sum } from 'lodash-es'
import { describe, beforeAll, it, expect } from 'vitest'
import { Providers } from '@latitude-data/constants'
import * as factories from '../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../tests/factories'
import { DocumentLog } from '../../browser'
import { previewDatasetFromLogs } from './previewFromLogs'
import { ProviderLogsRepository } from '../../repositories'
import { identityHashAlgorithm } from './utils'

let setup: FactoryCreateProjectReturn
let documentLog: DocumentLog

describe('previewDatasetFromLogs', async () => {
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

  it('preview from logs', async () => {
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
    const result = await previewDatasetFromLogs({
      workspace: setup.workspace,
      data: { name: 'paco', documentLogIds: [documentLog.id] },
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
        {
          identifier: 'tokens_identifier',
          name: 'tokens',
          role: 'metadata',
        },
      ],
      existingRows: [],
      newRows: [
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
})
