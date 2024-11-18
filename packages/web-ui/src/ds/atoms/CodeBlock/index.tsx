'use client'

import React from 'react'

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

export function CodeBlock(props: CodeBlockProps) {
  return (
    <ClientOnly>
      <Content {...props} />
    </ClientOnly>
  )
}

function Content({
  language,
  children,
  copy = true,
  className,
}: CodeBlockProps) {
  const { resolvedTheme } = useTheme()

  return (
    <div className='relative max-w-full overflow-x-auto'>
      {copy && (
        <div
          className={cn('absolute top-4 right-2', {
            'bg-backgroundCode': resolvedTheme === CurrentTheme.Light,
            'bg-[#282c34]': resolvedTheme === CurrentTheme.Dark,
          })}
        >
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
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
