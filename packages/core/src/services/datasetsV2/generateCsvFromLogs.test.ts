import { sum } from 'lodash-es'
import { describe, beforeAll, it, expect } from 'vitest'
import { Providers } from '@latitude-data/constants'
import * as factories from '../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../tests/factories'
import { DocumentLog } from '../../browser'
import { generateCsvFromLogs } from './generateCsvFromLogs'
import { ProviderLogsRepository } from '../../repositories'

let setup: FactoryCreateProjectReturn
let documentLog: DocumentLog

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

  it('generate csv', async () => {
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
    const result = await generateCsvFromLogs({
      workspace: setup.workspace,
      data: { documentLogIds: [documentLog.id] },
    })

    const repo = new ProviderLogsRepository(setup.workspace.id)
    const providers = await repo.findManyByDocumentLogUuid([documentLog.uuid])
    const tokens = sum(providers.map((p) => p.tokens ?? 0))
    expect(result.value)
      .toEqual(`age,location,expected_output,document_log_id,tokens
25,"San Francisco","""Last provider response. Hello!""",${documentLog.id},${tokens}`)
  })
})
