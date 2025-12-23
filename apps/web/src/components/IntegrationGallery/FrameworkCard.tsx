'use client'

import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useHover } from '@latitude-data/web-ui/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { FrameworkDefinition } from './frameworks'

export function FrameworkCard({
  framework,
  onClick,
}: {
  framework: FrameworkDefinition
  onClick: () => void
}) {
  const [ref, isHovered] = useHover<HTMLButtonElement>()

  return (
    <button
      ref={ref}
      type='button'
      onClick={onClick}
      className={cn(
        'w-full flex flex-col gap-4 p-5 rounded-2xl text-left',
        'border-2 transition-all cursor-pointer',
        isHovered
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background',
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
          isHovered ? 'bg-primary' : 'bg-muted',
        )}
      >
        <Icon
          name={framework.icon}
          size='normal'
          color={isHovered ? 'white' : 'foregroundMuted'}
        />
      </div>
      <Text.H4M color={isHovered ? 'accentForeground' : 'foreground'}>
        {framework.name}
      </Text.H4M>
    </button>
  )
}
