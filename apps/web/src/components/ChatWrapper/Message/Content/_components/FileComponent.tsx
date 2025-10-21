import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useState } from 'react'

export function FileComponent({ src }: { src: string }) {
  const [isHovering, setIsHovering] = useState(false)

  return (
    <a
      href={src}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        'flex flex-row p-4 gap-2 rounded-xl w-fit items-center',
        'text-muted-foreground hover:text-accent-foreground transition-colors',
        'bg-muted hover:bg-accent',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Icon
        name={isHovering ? 'fileDown' : 'file'}
        color={isHovering ? 'accentForeground' : 'foregroundMuted'}
      />
      <Text.H4
        whiteSpace='preWrap'
        wordBreak='breakAll'
        color={isHovering ? 'accentForeground' : 'foregroundMuted'}
      >
        {src.split('/').at(-1) || 'Unnamed file'}
      </Text.H4>
    </a>
  )
}
