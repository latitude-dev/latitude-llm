import React from 'react'

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

import { cn } from '../../../lib/utils'
import { CopyButton } from '../CopyButton'

interface CodeBlockProps {
  language: string
  children: string
  copy?: boolean
  className?: string
}

export function CodeBlock({
  language,
  children,
  copy = true,
  className,
}: CodeBlockProps) {
  return (
    <div className='relative max-w-full'>
      {copy && (
        <div className='absolute top-4 right-2 bg-backgroundCode'>
          <CopyButton content={children} color='foregroundMuted' />
        </div>
      )}
      <SyntaxHighlighter
        className={cn('text-sm', className)}
        language={language}
        style={oneLight}
        customStyle={{
          borderRadius: '0.375rem',
          padding: '1rem',
          lineHeight: '1.25rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
