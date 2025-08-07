import { Providers } from '@latitude-data/constants'
import { sum } from 'lodash-es'
import { beforeAll, describe, expect, it } from 'vitest'
import { DocumentLog } from '../../browser'
import { ProviderLogsRepository } from '../../repositories'
import * as factories from '../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../tests/factories'
import { generateCsvFromLogs } from './generateCsvFromLogs'

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
        listOfThings: [{ thing: 'thing1' }, { thing: 'thing2' }],
        simpleJson: { thing: 'thing1' },
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
      .toEqual(`age,location,simpleJson,listOfThings,output,document_log_id,tokens
25,San Francisco,"{""thing"":""thing1""}","[{""thing"":""thing1""},{""thing"":""thing2""}]",Last provider response. Hello!,${documentLog.id},${tokens}\n`)
  })
})
