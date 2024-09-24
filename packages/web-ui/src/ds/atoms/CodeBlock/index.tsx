import React from 'react'

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

import { CopyButton } from './CopyButton'

interface CodeBlockProps {
  language: string
  children: string
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  return (
    <div className='relative max-w-full'>
      <div className='absolute top-4 right-2'>
        <CopyButton content={children} />
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneLight}
        customStyle={{
          borderRadius: '0.375rem',
          padding: '1rem',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
