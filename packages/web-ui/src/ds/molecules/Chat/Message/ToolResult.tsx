import { ToolContent } from '@latitude-data/compiler'
import { CodeBlock, Icon, Text } from '../../../atoms'
import { CardTextContent, ContentCard } from './ContentCard'
import { ReactNode, useMemo } from 'react'
import { cn } from '../../../../lib/utils'
import { TextColor } from '../../../tokens'

// If the JSON is too long we don't parse it with CodeBlock component in order to avoid performance issues
const MAX_LENGTH_JSON_PREVIEW = 10000

function getResult<S extends boolean>(
  value: unknown,
): [S extends true ? string : unknown, S] {
  if (typeof value !== 'string') {
    return [value, false] as [S extends true ? string : unknown, S]
  }

  const stringValue = value as string
  try {
    const parsedResult = JSON.parse(stringValue)
    return getResult(parsedResult)
  } catch (_) {
    // do nothing
  }

  return [stringValue, true] as [S extends true ? string : unknown, S]
}

export function LoadingToolResultContent({
  loadingMessage = 'Waiting for tool response...',
}: {
  loadingMessage?: string
}) {
  return (
    <div className='w-full flex items-center gap-2 p-4'>
      <Icon name='loader' color='foregroundMuted' className='animate-spin' />
      <Text.H6 color='foregroundMuted'>{loadingMessage}</Text.H6>
    </div>
  )
}

export function ToolResultContent({
  toolResponse,
  color = 'foregroundMuted',
}: {
  toolResponse: ToolContent
  color?: TextColor
}) {
  const [result, isString] = useMemo(
    () => getResult(toolResponse.result),
    [toolResponse.result],
  )
  const fgColor = toolResponse.isError ? 'destructiveMutedForeground' : color

  if (isString) {
    return (
      <div
        className={cn('flex flex-col gap-2 p-4', {
          'bg-destructive-muted': toolResponse.isError,
        })}
      >
        {(result as string).split('\n').map((line, i) => (
          <Text.H5 key={i} color={fgColor}>
            {line}
          </Text.H5>
        ))}
      </div>
    )
  }

  const strResult = JSON.stringify(toolResponse.result, null, 2)

  return (
    <CodeBlock
      language={strResult.length > MAX_LENGTH_JSON_PREVIEW ? '' : 'json'}
    >
      {JSON.stringify(toolResponse.result, null, 2)}
    </CodeBlock>
  )
}

export function ToolResultFooter({
  loadingMessage,
  children,
}: {
  loadingMessage?: string
  children?: ReactNode
}) {
  if (children) return children
  return <LoadingToolResultContent loadingMessage={loadingMessage} />
}

/**
 * Used to display the contents from Tool Messages which toolCallIds are not found in the conversation
 */
export function UnresolvedToolResultContent({ value }: { value: ToolContent }) {
  const [result, isString] = useMemo(
    () => getResult(value.result),
    [value.result],
  )

  const bgColor = value.isError ? 'bg-destructive' : 'bg-muted'
  const fgColor = value.isError ? 'destructiveForeground' : 'foregroundMuted'

  return (
    <ContentCard
      label={value.toolName}
      icon='terminal'
      bgColor={bgColor}
      fgColor={fgColor}
      info={value.toolCallId}
    >
      {isString ? (
        <CardTextContent
          value={result as string}
          color={value.isError ? 'destructive' : 'foregroundMuted'}
        />
      ) : (
        <CodeBlock language='json'>
          {JSON.stringify(value.result, null, 2)}
        </CodeBlock>
      )}
    </ContentCard>
  )
}
