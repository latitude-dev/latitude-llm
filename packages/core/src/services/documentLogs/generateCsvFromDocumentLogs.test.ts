import { beforeEach, describe, expect, it } from 'vitest'

import { Providers, Workspace } from '../../browser'
import { NotFoundError } from '../../lib'
import * as factories from '../../tests/factories'
import { generateCsvFromDocumentLogs } from './generateCsvFromDocumentLogs'

type LogData = {
  parameters: Record<string, string>
  createdAt?: Date
}

async function setupWorkspaceWithLogs(logsData: LogData[]) {
  const setup = await factories.createProject({
    providers: [{ type: Providers.OpenAI, name: 'openai' }],
    documents: {
      'test.md': factories.helpers.createPrompt({
        provider: 'openai',
        model: 'gpt-4',
      }),
    },
  })
  const workspace = setup.workspace
  const document = setup.documents[0]!
  const commit = setup.commit

  const logs = await Promise.all(
    logsData.map((logData) =>
      factories.createDocumentLog({
        document,
        commit,
        parameters: logData.parameters,
        createdAt: logData.createdAt,
      }),
    ),
  )

  const documentLogIds = logs.map((log) => log.documentLog.id)

  return { workspace, documentLogIds }
}

describe('generateCsvFromDocumentLogs', () => {
  let workspace: Workspace
  let documentLogIds: number[]

  beforeEach(async () => {
    const { workspace: w, documentLogIds: ids } = await setupWorkspaceWithLogs([
      { parameters: { key1: 'value1', key2: 'value2', key3: 'value3' } },
      { parameters: { key1: 'value4', key2: 'value5' } },
      {
        parameters: {
          key1: 'value6',
          key2: 'value7',
          key3: 'value8',
          key4: 'value9',
        },
      },
    ])
    workspace = w
    documentLogIds = ids
  })

  it('returns CSV data with merged headers and consistent data output', async () => {
    const result = await generateCsvFromDocumentLogs({
      workspace,
      documentLogIds,
    })

    expect(result.error).toBeUndefined()
    const csvData = result.unwrap()

    // Check headers
    expect(csvData.headers).toEqual(
      expect.arrayContaining(['key1', 'key2', 'key3', 'key4']),
    )

    // Check data consistency
    expect(csvData.data).toHaveLength(3)
    expect(csvData.data[0]!.record).toMatchObject({
      key1: '"value1"',
      key2: '"value2"',
      key3: '"value3"',
      key4: '',
    })
    expect(csvData.data[1]!.record).toMatchObject({
      key1: '"value4"',
      key2: '"value5"',
      key3: '',
      key4: '',
    })
    expect(csvData.data[2]!.record).toMatchObject({
      key1: '"value6"',
      key2: '"value7"',
      key3: '"value8"',
      key4: '"value9"',
    })
  })

  it('returns NotFoundError if some document logs are missing', async () => {
    const { documentLogIds: otherWorkspaceDocumentLogIds } =
      await setupWorkspaceWithLogs([
        { parameters: { key1: 'value1', key2: 'value2', key3: 'value3' } },
      ])
    const result = await generateCsvFromDocumentLogs({
      workspace,
      documentLogIds: [...documentLogIds, ...otherWorkspaceDocumentLogIds],
    })

    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error?.message).toContain(
      `Document logs not found with ids: ${otherWorkspaceDocumentLogIds.join(', ')}`,
    )
  })

  it('returns BadRequestError result if no document log IDs are provided', async () => {
    const result = await generateCsvFromDocumentLogs({
      workspace,
      documentLogIds: [],
    })

    expect(result.error).toBeUndefined()
    const csvData = result.unwrap()

    expect(csvData.headers).toEqual([])
    expect(csvData.data).toHaveLength(0)
  })
})
