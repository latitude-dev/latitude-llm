import {
  ImageContent,
  MessageContent,
  TextContent,
} from '@latitude-data/compiler'

import { cn } from '../../../../lib/utils'
import { Badge, Text } from '../../../atoms'
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
      <div className='flex flex-row items-stretch gap-4 pl-4'>
        <div className='flex-shrink-0 bg-muted w-1 rounded-lg' />
        <div className={cn('flex flex-col gap-1')}>
          {typeof content === 'string' ? (
            <ContentValue value={content} color='foregroundMuted' size={size} />
          ) : (
            content.map((c, idx) => (
              <ContentValue
                key={idx}
                index={idx}
                color='foregroundMuted'
                value={(c as TextContent)?.text || (c as ImageContent)?.image}
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
  value: string | Uint8Array | Buffer | ArrayBuffer | URL
  size?: 'default' | 'small'
}) => {
  // TODO: Handle the rest of types
  if (typeof value !== 'string') return

  const TextComponent = size === 'small' ? Text.H6 : Text.H5

  return value?.split('\n')?.map((line, lineIndex) => (
    <TextComponent
      color={color}
      whiteSpace='preWrap'
      wordBreak='breakAll'
      key={`${index}-${lineIndex}`}
    >
      {line ? line : '\n'}
    </TextComponent>
  ))
}
