import { MessageContent } from '@latitude-data/compiler'
import { Badge, BadgeProps, Text } from '$ui/ds/atoms'
import { TextColor } from '$ui/ds/tokens'
import { cn } from '$ui/lib/utils'

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
  animatePulse?: boolean
}

export function Message({
  role,
  content,
  animatePulse,
  variant = 'muted',
}: MessageProps) {
  const { badgeVariant, textColor } = MessageVariants[variant]
  return (
    <div
      className={cn('flex flex-row gap-4 w-full items-start', {
        'animate-pulse': animatePulse,
      })}
    >
      <div className='min-w-24'>
        <Badge variant={badgeVariant}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </Badge>
      </div>
      <div className='flex flex-col gap-1'>
        {typeof content === 'string' ? (
          <ContentValue value={content} color={textColor} />
        ) : (
          content.map((c, idx) => (
            <ContentValue
              key={idx}
              index={idx}
              color={textColor}
              value={c.value}
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
}: {
  index?: number
  color: TextColor
  value: string
}) => {
  return value.split('\n').map((line, lineIndex) => (
    <Text.H5 color={color} whiteSpace='preWrap' key={`${index}-${lineIndex}`}>
      {line}
    </Text.H5>
  ))
}
