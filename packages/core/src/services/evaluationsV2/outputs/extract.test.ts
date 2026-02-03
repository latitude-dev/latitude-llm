import { Message, TextContent } from '@latitude-data/constants/messages'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DATASET_LABEL } from '../../../constants'
import { BadRequestError, UnprocessableEntityError } from '../../../lib/errors'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { type DatasetRow } from '../../../schema/models/types/DatasetRow'
import * as factories from '../../../tests/factories'
import { extractActualOutput, extractExpectedOutput } from './extract'

describe('extractActualOutput', () => {
  let conversation: Message[]

  beforeEach(async () => {
    conversation = [
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
        toolCalls: [],
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
              good: false,
              count: 0,
              alignment: null,
            },
          },
          {
            type: 'tool-call',
            toolCallId: 'tool-call-2',
            toolName: 'tool-2',
            args: {
              answer: 'Some answer',
            },
          },
          {
            type: 'text',
            text: 'Some assistant response 2',
          },
        ],
      },
    ]
  })

  it('fails when conversation does not contain any assistant messages', () => {
    expect(() =>
      extractActualOutput({
        conversation: conversation,
        configuration: {
          messageSelection: 'all',
          contentFilter: 'file',
          parsingFormat: 'string',
        },
      }).unwrap(),
    ).toThrowError(
      new UnprocessableEntityError(
        'Conversation does not contain any assistant messages with file content',
      ),
    )
  })

  it('fails when output cannot be parsed with the format', () => {
    ;(conversation[2].content[3] as unknown as TextContent).text =
      'not a valid json'

    expect(() =>
      extractActualOutput({
        conversation,
        configuration: {
          messageSelection: 'last',
          parsingFormat: 'json',
        },
      }).unwrap(),
    ).toThrowError(
      new UnprocessableEntityError(
        `Unexpected token 'o', "not a valid json" is not valid JSON`,
      ),
    )
  })

  it('fails when field is not present in the output', () => {
    ;(conversation[2].content[3] as unknown as TextContent).text =
      '{"answer": 42}'

    expect(() =>
      extractActualOutput({
        conversation,
        configuration: {
          messageSelection: 'last',
          parsingFormat: 'json',
          fieldAccessor: 'response',
        },
      }).unwrap(),
    ).toThrowError(
      new UnprocessableEntityError(
        `Field 'response' is not present in the actual output`,
      ),
    )
  })

  it('fails when configuration is not set', () => {
    expect(() =>
      extractActualOutput({
        conversation,
        configuration: undefined as any,
      }).unwrap(),
    ).toThrowError(
      new TypeError(
        "Cannot read properties of undefined (reading 'contentFilter')",
      ),
    )
  })

  it('succeeds when selecting the messages', async () => {
    const result = extractActualOutput({
      conversation,
      configuration: {
        messageSelection: 'all',
        parsingFormat: 'string',
      },
    }).unwrap()

    expect(result).toEqual(
      `
Some assistant response 1

{"type":"tool-call","toolCallId":"tool-call-1","toolName":"tool-1","args":{"classes":[{"id":"class-1","variants":["class-1-variant-1","class-1-variant-2"]},{"id":"class-2","variants":["class-2-variant-1","class-2-variant-2"]}],"good":false,"count":0,"alignment":null}}

{"type":"tool-call","toolCallId":"tool-call-2","toolName":"tool-2","args":{"answer":"Some answer"}}

Some assistant response 2
`.trim(),
    )
  })

  it('succeeds when filtering by content type', async () => {
    const result = extractActualOutput({
      conversation,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'string',
      },
    }).unwrap()

    expect(result).toEqual(
      `
{"type":"tool-call","toolCallId":"tool-call-1","toolName":"tool-1","args":{"classes":[{"id":"class-1","variants":["class-1-variant-1","class-1-variant-2"]},{"id":"class-2","variants":["class-2-variant-1","class-2-variant-2"]}],"good":false,"count":0,"alignment":null}}

{"type":"tool-call","toolCallId":"tool-call-2","toolName":"tool-2","args":{"answer":"Some answer"}}
`.trim(),
    )
  })

  it('succeeds when parsing the output', async () => {
    const result = extractActualOutput({
      conversation,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'json',
      },
    }).unwrap()

    expect(result).toEqual(
      '[{"args":{"alignment":null,"classes":[{"id":"class-1","variants":["class-1-variant-1","class-1-variant-2"]},{"id":"class-2","variants":["class-2-variant-1","class-2-variant-2"]}],"count":0,"good":false},"toolCallId":"tool-call-1","toolName":"tool-1","type":"tool-call"},{"args":{"answer":"Some answer"},"toolCallId":"tool-call-2","toolName":"tool-2","type":"tool-call"}]',
    )
  })

  it('succeeds when accessing the output by field as string', async () => {
    const result = extractActualOutput({
      conversation,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'json',
        fieldAccessor: '[-2].args.classes[1].variants[-1]',
      },
    }).unwrap()

    expect(result).toEqual('class-2-variant-2')
  })

  it('succeeds when accessing the output by field as number', async () => {
    const result = extractActualOutput({
      conversation,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'json',
        fieldAccessor: '[-2].args.count',
      },
    }).unwrap()

    expect(result).toEqual('0')
  })

  it('succeeds when accessing the output by field as boolean', async () => {
    const result = extractActualOutput({
      conversation,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'json',
        fieldAccessor: '[-2].args.good',
      },
    }).unwrap()

    expect(result).toEqual('false')
  })

  it('succeeds when accessing the output by field as nullable', async () => {
    const result = extractActualOutput({
      conversation,
      configuration: {
        messageSelection: 'all',
        contentFilter: 'tool_call',
        parsingFormat: 'json',
        fieldAccessor: '[-2].args.alignment',
      },
    }).unwrap()

    expect(result).toEqual('')
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

  it('succeeds when there is no output as undefined', async () => {
    datasetRow.rowData[datasetColumn] = undefined

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'string',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual('')
  })

  it('succeeds when there is no output as nullable', async () => {
    datasetRow.rowData[datasetColumn] = null

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'string',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual('')
  })

  it('succeeds when there is no output as empty', async () => {
    datasetRow.rowData[datasetColumn] = ''

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'string',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual('')
  })

  it('succeeds when parsing the output', async () => {
    datasetRow.rowData[datasetColumn] =
      '{"answer": {"classes": [{"id": "class-1", "variants": ["class-1-variant-1", "class-1-variant-2"]}, {"id": "class-2", "variants": ["class-2-variant-1", "class-2-variant-2"]}], "good": false, "count": 0, "alignment": null}}'

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'json',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      '{"answer":{"alignment":null,"classes":[{"id":"class-1","variants":["class-1-variant-1","class-1-variant-2"]},{"id":"class-2","variants":["class-2-variant-1","class-2-variant-2"]}],"count":0,"good":false}}',
    )
  })

  it('succeeds when accessing the output by field as string', async () => {
    datasetRow.rowData[datasetColumn] =
      '{"answer": {"classes": [{"id": "class-1", "variants": ["class-1-variant-1", "class-1-variant-2"]}, {"id": "class-2", "variants": ["class-2-variant-1", "class-2-variant-2"]}], "good": false, "count": 0, "alignment": null}}'

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

  it('succeeds when accessing the output by field as number', async () => {
    datasetRow.rowData[datasetColumn] =
      '{"answer": {"classes": [{"id": "class-1", "variants": ["class-1-variant-1", "class-1-variant-2"]}, {"id": "class-2", "variants": ["class-2-variant-1", "class-2-variant-2"]}], "good": false, "count": 0, "alignment": null}}'

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'json',
        fieldAccessor: 'answer.count',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual('0')
  })

  it('succeeds when accessing the output by field as boolean', async () => {
    datasetRow.rowData[datasetColumn] =
      '{"answer": {"classes": [{"id": "class-1", "variants": ["class-1-variant-1", "class-1-variant-2"]}, {"id": "class-2", "variants": ["class-2-variant-1", "class-2-variant-2"]}], "good": false, "count": 0, "alignment": null}}'

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'json',
        fieldAccessor: 'answer.good',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual('false')
  })

  it('succeeds when accessing the output by field as nullable', async () => {
    datasetRow.rowData[datasetColumn] =
      '{"answer": {"classes": [{"id": "class-1", "variants": ["class-1-variant-1", "class-1-variant-2"]}, {"id": "class-2", "variants": ["class-2-variant-1", "class-2-variant-2"]}], "good": false, "count": 0, "alignment": null}}'

    const result = await extractExpectedOutput({
      dataset: dataset,
      row: datasetRow,
      column: datasetLabel,
      configuration: {
        parsingFormat: 'json',
        fieldAccessor: 'answer.alignment',
      },
    }).then((r) => r.unwrap())

    expect(result).toEqual('')
  })
})
