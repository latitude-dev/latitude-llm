import type { ContentType, Message } from '@latitude-data/compiler'
import {
  ACCESSIBLE_OUTPUT_FORMATS,
  ActualOutputConfiguration,
  buildConversation,
  Dataset,
  DatasetRow,
  ExpectedOutputConfiguration,
  formatMessage,
  ProviderLogDto,
} from '../../../browser'
import { BadRequestError, UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { getColumnData } from '../../datasets/utils'

const CONTENT_FILTER_TYPE: Record<
  Required<ActualOutputConfiguration>['contentFilter'],
  `${ContentType}`
> = {
  text: 'text',
  image: 'image',
  file: 'file',
  tool_call: 'tool-call',
}

const ARRAY_INDEX_REGEX = /\[(\w+)\]/g
function accessField(output: any, path: string = '') {
  path = path.trim().replace(ARRAY_INDEX_REGEX, '.$1')
  const parts = path ? path.split('.') : []

  let value = output
  for (const part of parts) {
    if (value !== undefined && typeof value === 'object' && part in value) {
      value = value[part]
    } else {
      return undefined
    }
  }

  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch (error) {
    return value.toString()
  }
}

function parseOutput(output: string, format: string) {
  switch (format) {
    case 'string':
      return output
    case 'json':
      return JSON.parse(output)
    default:
      throw new BadRequestError('Invalid output parsing format')
  }
}

export async function extractActualOutput({
  providerLog,
  configuration,
}: {
  providerLog: ProviderLogDto
  configuration?: ActualOutputConfiguration
}) {
  if (!configuration) {
    configuration = {
      messageSelection: 'last',
      parsingFormat: 'string',
    }
  }

  let actualOutput = ''
  let conversation = buildConversation(providerLog)

  conversation = conversation.filter((message) => message.role === 'assistant')
  if (configuration.contentFilter) {
    const contentFilter = CONTENT_FILTER_TYPE[configuration.contentFilter]
    if (!contentFilter) {
      return Result.error(new BadRequestError('Invalid message content filter'))
    }

    const filteredConversation = []
    for (const message of conversation) {
      if (typeof message.content === 'string') {
        if (contentFilter === 'text') {
          filteredConversation.push(message)
        }
      } else {
        const filteredContent = message.content.filter(
          (content) => content.type === contentFilter,
        )
        if (filteredContent.length > 0) {
          filteredConversation.push({
            ...message,
            content: filteredContent,
          } as Message)
        }
      }
    }
    conversation = filteredConversation
  }

  if (conversation.length < 1) {
    return Result.error(
      new UnprocessableEntityError(
        'Log does not contain any assistant messages',
      ),
    )
  }

  switch (configuration.messageSelection) {
    case 'last':
      {
        actualOutput = formatMessage(conversation.at(-1)!)
      }
      break
    case 'all':
      {
        actualOutput = conversation.map(formatMessage).join('\n\n')
      }
      break
    default:
      return Result.error(
        new BadRequestError('Invalid assistant message selection'),
      )
  }

  try {
    actualOutput = parseOutput(actualOutput, configuration.parsingFormat)
  } catch (error) {
    return Result.error(new UnprocessableEntityError((error as Error).message))
  }

  if (ACCESSIBLE_OUTPUT_FORMATS.includes(configuration.parsingFormat)) {
    actualOutput = accessField(actualOutput, configuration.fieldAccessor)
    if (actualOutput === undefined) {
      return Result.error(
        new UnprocessableEntityError(
          `Field '${configuration.fieldAccessor}' is not present in the actual output`,
        ),
      )
    }
  }

  if (!actualOutput) {
    return Result.error(
      new UnprocessableEntityError('Actual output is required'),
    )
  }

  return Result.ok(actualOutput)
}

export async function extractExpectedOutput({
  dataset,
  row,
  column,
  configuration,
}: {
  dataset: Dataset
  row: DatasetRow
  column: string
  configuration?: ExpectedOutputConfiguration
}) {
  if (!configuration) {
    configuration = {
      parsingFormat: 'string',
    }
  }

  let expectedOutput = ''

  if (!dataset.columns.find((c) => c.name === column)) {
    return Result.error(
      new BadRequestError(`Column '${column}' not found in dataset`),
    )
  }

  expectedOutput = getColumnData({ dataset, row, column })

  try {
    expectedOutput = parseOutput(expectedOutput, configuration.parsingFormat)
  } catch (error) {
    return Result.error(new UnprocessableEntityError((error as Error).message))
  }

  if (ACCESSIBLE_OUTPUT_FORMATS.includes(configuration.parsingFormat)) {
    expectedOutput = accessField(expectedOutput, configuration.fieldAccessor)
    if (expectedOutput === undefined) {
      return Result.error(
        new UnprocessableEntityError(
          `Field '${configuration.fieldAccessor}' is not present in the expected output`,
        ),
      )
    }
  }

  if (!expectedOutput) {
    return Result.error(
      new UnprocessableEntityError('Expected output is required'),
    )
  }

  return Result.ok(expectedOutput)
}
