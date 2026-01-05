'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
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
  const [ref, isHovered] = useHover<HTMLDivElement>()

  return (
    <Button
      key={framework.name}
      variant='ghost'
      className='p-0'
      fullWidth
      onClick={onClick}
      tabIndex={-1}
    >
      <div
        ref={ref}
        className={cn(
          'w-full flex flex-col gap-4 p-5 rounded-2xl',
          'border-2 transition-all',
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
      </div>
    </Button>
  )
}

