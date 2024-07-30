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
  content: MessageContent[]
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
        {content.map((c, contentIndex) =>
          c.value.split('\n').map((line, lineIndex) => (
            <Text.H5
              color={textColor}
              whiteSpace='preWrap'
              key={`${contentIndex}-${lineIndex}`}
            >
              {line}
            </Text.H5>
          )),
        )}
      </div>
    </div>
  )
}
