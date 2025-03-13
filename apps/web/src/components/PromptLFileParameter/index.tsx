'use client'
import { cn, Icon, Text } from '@latitude-data/web-ui'
import Link from 'next/link'
import { isPromptLFile, PromptLFile } from 'promptl-ai'
import { useState } from 'react'

export function PromptLFileParameter({ file }: { file: PromptLFile }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <Link href={file.url} passHref target='_blank' className='max-w-full'>
      <div
        className={cn(
          'flex flex-row gap-2 px-2 py-1.5 rounded-md items-center max-w-full',
          'flex-nowrap cursor-pointer truncate',
          'border border-border hover:border-primary',
          'bg-muted hover:bg-accent',
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Icon
          name='paperclip'
          color={isHovered ? 'accentForeground' : 'foregroundMuted'}
          className='flex flex-shrink-0'
        />
        <Text.H6
          color={isHovered ? 'accentForeground' : 'foregroundMuted'}
          noWrap
          ellipsis
        >
          {file.name}
        </Text.H6>
        <Icon
          name='externalLink'
          color={isHovered ? 'accentForeground' : 'foregroundMuted'}
          size='small'
          className='flex flex-shrink-0'
        />
      </div>
    </Link>
  )
}

export function asPromptLFile(value: unknown): PromptLFile | undefined {
  if (isPromptLFile(value)) return value
  if (typeof value !== 'string') return undefined

  try {
    const parsed = JSON.parse(value)
    if (isPromptLFile(parsed)) return parsed
    return undefined
  } catch {
    return undefined
  }
}
