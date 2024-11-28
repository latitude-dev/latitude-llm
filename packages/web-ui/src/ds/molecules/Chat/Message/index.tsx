import {
  ContentType,
  MessageContent,
  TextContent,
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/compiler'

import { cn } from '../../../../lib/utils'
import { Badge, CodeBlock, Skeleton, Text } from '../../../atoms'
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

export function MessageSkeleton({ role }: { role: string }) {
  return (
    <div className='flex flex-col gap-1 w-full items-start animate-pulse'>
      <div>
        <Badge variant={roleVariant(role)}>
          <div className='w-16' />
        </Badge>
      </div>
      <div className='flex flex-row items-stretch gap-4 pl-4 w-full'>
        <div className='flex-shrink-0 bg-muted w-1 rounded-lg' />
        <div className='flex flex-col gap-1 flex-grow min-w-0'>
          <Skeleton height='h5' className='w-1/2' />
          <Skeleton height='h5' className='w-3/4' />
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
      return (
        <div className='pt-2 w-full'>
          <div className='overflow-hidden rounded-lg w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(value as ToolRequestContent, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )

    case ContentType.toolResult:
      return (
        <div className='pt-2 w-full'>
          <div className='overflow-hidden rounded-lg w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(value as ToolContent, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )

    default:
      return null
  }
}
