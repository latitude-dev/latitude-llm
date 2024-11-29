import {
  ContentType,
  MessageContent,
  TextContent,
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/compiler'

import { cn } from '../../../../lib/utils'
import { Badge, CodeBlock, Text } from '../../../atoms'
import { TextColor } from '../../../tokens'
import { roleVariant } from './helpers'

export { roleVariant } from './helpers'

export type MessageProps = {
  role: string
  content: MessageContent[] | string
  className?: string
  size?: 'default' | 'small'
  animatePulse?: boolean
}

export function Message({
  role,
  content,
  animatePulse,
  size = 'default',
}: MessageProps) {
  return (
    <div
      className={cn('flex flex-col gap-1 w-full items-start', {
        'animate-pulse': animatePulse,
      })}
    >
      <div>
        <Badge variant={roleVariant(role)}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </Badge>
      </div>
      <div className='flex w-full flex-row items-stretch gap-4 pl-4'>
        <div className='flex-shrink-0 bg-muted w-1 rounded-lg' />
        <div className={cn('flex flex-1 flex-col gap-1')}>
          {typeof content === 'string' ? (
            <ContentValue value={content} color='foregroundMuted' size={size} />
          ) : (
            content.map((c, idx) => (
              <ContentValue
                key={idx}
                index={idx}
                color='foregroundMuted'
                value={c}
                size={size}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

const ContentValue = ({
  index = 0,
  color,
  value,
  size,
}: {
  index?: number
  color: TextColor
  value: MessageContent | string
  size?: 'default' | 'small'
}) => {
  const TextComponent = size === 'small' ? Text.H6 : Text.H5

  if (typeof value === 'string') {
    return value.split('\n').map((line, lineIndex) => (
      <TextComponent
        color={color}
        whiteSpace='preWrap'
        wordBreak='normal'
        key={`${index}-${lineIndex}`}
      >
        {line || '\n'}
      </TextComponent>
    ))
  }

  switch (value.type) {
    case ContentType.text:
      return (value as TextContent).text.split('\n').map((line, lineIndex) => (
        <TextComponent
          color={color}
          whiteSpace='preWrap'
          wordBreak='breakAll'
          key={`${index}-${lineIndex}`}
        >
          {line || '\n'}
        </TextComponent>
      ))

    case ContentType.image:
      return <div>Image content not implemented yet</div>

    case ContentType.toolCall:
      const toolCall = value as ToolRequestContent
      return (
        <div className='pt-2 w-full'>
          <div className='overflow-hidden rounded-lg w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(toolCall, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )

    case ContentType.toolResult:
      const toolResult = value as ToolContent
      return (
        <div className='pt-2 w-full'>
          <div className='overflow-hidden rounded-lg w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(toolResult, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )

    default:
      return null
  }
}
