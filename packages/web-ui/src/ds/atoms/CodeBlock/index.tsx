'use client'

import React, { memo, useMemo } from 'react'

import { useTheme } from 'next-themes'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism'

import { CurrentTheme } from '../../../constants'
import { cn } from '../../../lib/utils'
import { ClientOnly } from '../ClientOnly'
import { CopyButton } from '../CopyButton'

interface CodeBlockProps {
  language: string
  children: string
  copy?: boolean
  className?: string
}

export const CodeBlock = memo((props: CodeBlockProps) => {
  return (
    <ClientOnly>
      <Content {...props} />
    </ClientOnly>
  )
})

export function useCodeBlockBackgroundColor() {
  const { resolvedTheme } = useTheme()
  if (resolvedTheme === CurrentTheme.Light) return 'bg-backgroundCode'
  return 'bg-[#282c34]'
}

const Content = memo(
  ({ language, children, copy = true, className }: CodeBlockProps) => {
    const { resolvedTheme } = useTheme()
    const bgColor = useCodeBlockBackgroundColor()
    return (
      <div className={cn('relative max-w-full overflow-x-auto', bgColor)}>
        {copy && (
          <div className='absolute top-4 right-2'>
            <CopyButton content={children} color='foregroundMuted' />
          </div>
        )}
        <SyntaxHighlighter
          className={cn('text-sm', className)}
          language={language}
          style={resolvedTheme === CurrentTheme.Dark ? oneDark : oneLight}
          customStyle={{
            borderRadius: '0.375rem',
            padding: '1rem',
            lineHeight: '1.25rem',
            margin: '0',
          }}
        >
          {useMemo(() => children, [children])}
        </SyntaxHighlighter>
      </div>
    )
  },
)
