'use client'

import React, { memo, ReactNode } from 'react'
import { useTheme } from 'next-themes'

import { CurrentTheme } from '../../../constants'
import { cn } from '../../../lib/utils'
import { ClientOnly } from '../ClientOnly'
import { CopyButton } from '../CopyButton'
import { SyntaxHighlighter } from './SyntaxHightlighter'

interface CodeBlockProps {
  language: string
  children: string
  copy?: boolean
  action?: ReactNode
  className?: string
}

export function useCodeBlockBackgroundColor() {
  const { resolvedTheme } = useTheme()
  if (resolvedTheme === CurrentTheme.Light) return 'bg-backgroundCode'
  return 'bg-[#282c34]'
}

const Content = memo(
  ({ language, children, copy = true, action, className }: CodeBlockProps) => {
    const { resolvedTheme } = useTheme()
    const bgColor = useCodeBlockBackgroundColor()
    return (
      <div className={cn('relative max-w-full overflow-x-auto', bgColor)}>
        {copy || action ? (
          <div className='absolute top-4 right-2'>
            {copy ? (
              <CopyButton content={children} color='foregroundMuted' />
            ) : action ? (
              action
            ) : null}
          </div>
        ) : null}
        <SyntaxHighlighter
          className={cn('text-sm', className)}
          currentTheme={resolvedTheme}
          language={language}
          customStyle={{
            borderRadius: '0.375rem',
            padding: '1rem',
            lineHeight: '1.25rem',
            margin: '0',
          }}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    )
  },
)

export const CodeBlock = memo((props: CodeBlockProps) => {
  return (
    <ClientOnly>
      <Content {...props} />
    </ClientOnly>
  )
})
