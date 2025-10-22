import { Providers } from '@latitude-data/constants'
import type { Message } from '@latitude-data/constants/legacyCompiler'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DATASET_LABEL } from '../../../constants'
import { BadRequestError, UnprocessableEntityError } from '../../../lib/errors'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { type DatasetRow } from '../../../schema/models/types/DatasetRow'
import { ProviderLogDto } from '../../../schema/types'
import * as factories from '../../../tests/factories'
import serializeProviderLog from '../../providerLogs/serialize'
import { extractActualOutput, extractExpectedOutput } from './extract'

describe('extractActualOutput', () => {
  let providerLog: ProviderLogDto

  beforeEach(async () => {
    const {
      documents: [document],
      commit,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    const { providerLogs: providerLogs } = await factories.createDocumentLog({
      document: document!,
      commit: commit,
    })
    providerLog = serializeProviderLog(providerLogs.at(-1)!)
    providerLog.messages = [
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Some system content',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Some user content',
          },
          {
            type: 'image',
            image: 'https://example.com/some-image.png',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Some assistant response 1',
          },
          {
            type: 'tool-call',
            toolCallId: 'tool-call-1',
            toolName: 'tool-1',
            args: {
              classes: [
                {
                  id: 'class-1',
                  variants: ['class-1-variant-1', 'class-1-variant-2'],
                },
                {
                  id: 'class-2',
                  variants: ['class-2-variant-1', 'class-2-variant-2'],
                },
              ],
            },
          },
        ],
      },
    ] as Message[]
    providerLog.response = 'Some assistant response 2'
    providerLog.toolCalls = []
  })

  it('fails when conversation does not contain any assistant messages', async () => {
    await expect(
      extractActualOutput({
        providerLog: providerLog,
        configuration: {
          messageSelection: 'all',
          contentFilter: 'file',
          parsingFormat: 'string',
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Conversation does not contain any assistant messages with file content',
      ),
    )
  })

  it('fails when output cannot be parsed with the format', async () => {
    providerLog.response = 'not a valid json'

    await expect(
      extractActualOutput({
        providerLog: providerLog,
        configuration: {
          messageSelection: 'last',
          parsingFormat: 'json',
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        `Unexpected token 'o', "not a valid json" is not valid JSON`,
      ),
    )
  })

  it('fails when field is not present in the output', async () => {
    providerLog.response = '{"answer": 42}'

    await expect(
      extractActualOutput({
        providerLog: providerLog,
        configuration: {
          messageSelection: 'last',
          parsingFormat: 'json',
          fieldAccessor: 'response',
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        `Field 'response' is not present in the actual output`,
      ),
    )
  })

  it('fails when there is no output', async () => {
    providerLog.response = ''

    await expect(
      extractActualOutput({
        providerLog: providerLog,
        configuration: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Actual output is required'),
    )
  })

  it('fails when configuration is not set', async () => {
    await expect(
      extractActualOutput({
        providerLog: providerLog,
        configuration: undefined as any,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new TypeError(
        "Cannot read properties of undefined (reading 'contentFilter')",
      ),
    )
  })

  it('succeeds when selecting the messages', async () => {
    const result = await extractActualOutput({
      providerLog: providerLog,
      configuration: {
        messageSelection: 'all',
        parsingFormat: 'string',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      `
Some assistant response 1
{"type":"tool-call","toolCallId":"tool-call-1","toolName":"tool-1","args":{"classes":[{"id":"class-1","variants":["class-1-variant-1","class-1-variant-2"]},{"id":"class-2","variants":["class-2-variant-1","class-2-variant-2"]}]}}

Some assistant response 2
`.trim(),
    )
  })

  it('succeeds when filtering by content type', async () => {
    const result = await extractActualOutput({
      providerLog: providerLog,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'string',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      '{"type":"tool-call","toolCallId":"tool-call-1","toolName":"tool-1","args":{"classes":[{"id":"class-1","variants":["class-1-variant-1","class-1-variant-2"]},{"id":"class-2","variants":["class-2-variant-1","class-2-variant-2"]}]}}',
    )
  })

  it('succeeds when parsing the output', async () => {
    const result = await extractActualOutput({
      providerLog: providerLog,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'json',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      '[{"type":"tool-call","toolCallId":"tool-call-1","toolName":"tool-1","args":{"classes":[{"id":"class-1","variants":["class-1-variant-1","class-1-variant-2"]},{"id":"class-2","variants":["class-2-variant-1","class-2-variant-2"]}]}}]',
    )
  })

  it('succeeds when accessing the output by field', async () => {
    const result = await extractActualOutput({
      providerLog: providerLog,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'json',
        fieldAccessor: '[-1].args.classes[1].variants[-1]',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual('class-2-variant-2')
  })
})

describe('extractExpectedOutput', () => {
  let dataset: Dataset
  let datasetLabel: string
  let datasetRow: DatasetRow
  let datasetColumn: string

  beforeEach(async () => {
    const { workspace, user } = await factories.createProject()

    datasetLabel = DEFAULT_DATASET_LABEL
    const { dataset: d } = await factories.createDataset({
      author: user,
      fileContent: `
param1,param2,${DEFAULT_DATASET_LABEL}
value1,value2,"Some expected output"
`.trim(),
      workspace: workspace,
    })
    dataset = d

    datasetRow = await factories.createDatasetRow({
      dataset: dataset,
      columns: dataset.columns,
      workspace: workspace,
    })
    datasetColumn = dataset.columns.find(
      (c) => c.name === datasetLabel,
    )!.identifier

    datasetRow.rowData = {
      FRnxVQp: 'value1',
      M0doaQK: 'value2',
      [datasetColumn]: 'Some expected output',
    }
  })

  it('fails when column is not found in the dataset', async () => {
    await expect(
      extractExpectedOutput({
        dataset: dataset,
        row: datasetRow,
        column: 'unknown',
        configuration: {
          parsingFormat: 'string',
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(`Column 'unknown' not found in dataset`),
    )
  })

  it('fails when output cannot be parsed with the format', async () => {
    datasetRow.rowData[datasetColumn] = 'not a valid json'

    await expect(
      extractExpectedOutput({
        dataset: dataset,
        row: datasetRow,
        column: datasetLabel,
        configuration: {
          parsingFormat: 'json',
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        `Unexpected token 'o', "not a valid json" is not valid JSON`,
      ),
    )
  })

  it('fails when field is not present in the output', async () => {
    datasetRow.rowData[datasetColumn] = '{"answer": 42}'

    await expect(
      extractExpectedOutput({
        dataset: dataset,
        row: datasetRow,
        column: datasetLabel,
        configuration: {
          parsingFormat: 'json',
          fieldAccessor: 'response',
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        `Field 'response' is not present in the expected output`,
      ),
    )
  })

  it('fails when there is no output', async () => {
    datasetRow.rowData[datasetColumn] = ''

    await expect(
      extractExpectedOutput({
        dataset: dataset,
        row: datasetRow,
        column: datasetLabel,
        configuration: {
          parsingFormat: 'string',
        },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Expected output is required'),
    )
  })

  it('fails when configuration is not set', async () => {
    await expect(
      extractExpectedOutput({
        dataset: dataset,
        row: datasetRow,
        column: datasetLabel,
        configuration: undefined as any,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        "Cannot read properties of undefined (reading 'parsingFormat')",
      ),
    )
  })

  it('succeeds when parsing the output', async () => {
    datasetRow.rowData[datasetColumn] =
      '{"answer": {"classes": [{"id": "class-1", "variants": ["class-1-variant-1", "class-1-variant-2"]}, {"id": "class-2", "variants": ["class-2-variant-1", "class-2-variant-2"]}]}}'

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'json',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      '{"answer":{"classes":[{"id":"class-1","variants":["class-1-variant-1","class-1-variant-2"]},{"id":"class-2","variants":["class-2-variant-1","class-2-variant-2"]}]}}',
    )
  })

  it('succeeds when accessing the output by field', async () => {
    datasetRow.rowData[datasetColumn] =
      '{"answer": {"classes": [{"id": "class-1", "variants": ["class-1-variant-1", "class-1-variant-2"]}, {"id": "class-2", "variants": ["class-2-variant-1", "class-2-variant-2"]}]}}'

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'json',
        fieldAccessor: 'answer.classes[1].variants[-1]',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual('class-2-variant-2')
  })
})
