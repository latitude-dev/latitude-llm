import {
  ImageContent,
  MessageContent,
  TextContent,
} from '@latitude-data/compiler'

import { cn } from '../../../../lib/utils'
import { Badge, BadgeProps, Text } from '../../../atoms'
import { TextColor } from '../../../tokens'

type MessageVariant = {
  badgeVariant: BadgeProps['variant']
  textColor: TextColor
}

const MessageVariants = {
  muted: {
    badgeVariant: 'muted',
    textColor: 'foregroundMuted',
  } as MessageVariant,
  accent: {
    badgeVariant: 'accent',
    textColor: 'accentForeground',
  } as MessageVariant,
  outline: {
    badgeVariant: 'outline',
    textColor: 'foregroundMuted',
  } as MessageVariant,
  destructive: {
    badgeVariant: 'destructive',
    textColor: 'destructive',
  } as MessageVariant,
}

export type MessageProps = {
  role: string
  content: MessageContent[] | string
  className?: string
  variant?: keyof typeof MessageVariants
  layout?: 'horizontal' | 'vertical'
  size?: 'default' | 'small'
  animatePulse?: boolean
}

export function Message({
  role,
  content,
  animatePulse,
  variant = 'muted',
  layout = 'horizontal',
  size = 'default',
}: MessageProps) {
  const { badgeVariant, textColor } = MessageVariants[variant]
  return (
    <div
      className={cn('flex w-full items-start', {
        'animate-pulse': animatePulse,
        'flex-row gap-4': layout === 'horizontal',
        'flex-col gap-2': layout === 'vertical',
      })}
    >
      <div className='min-w-24'>
        <Badge variant={badgeVariant}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </Badge>
      </div>
      <div className='flex flex-col gap-1'>
        {typeof content === 'string' ? (
          <ContentValue value={content} color={textColor} size={size} />
        ) : (
          content.map((c, idx) => (
            <ContentValue
              key={idx}
              index={idx}
              color={textColor}
              value={(c as TextContent)?.text || (c as ImageContent)?.image}
              size={size}
            />
          ))
        )}
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
      key={`${index}-${lineIndex}`}
    >
      {line}
    </TextComponent>
  ))
}
