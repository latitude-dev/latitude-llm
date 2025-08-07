'use client'

import { useTheme } from 'next-themes'
import { memo, ReactNode } from 'react'

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
  textWrap?: boolean
  bgColor?: string
}

export function useCodeBlockBackgroundColor(override?: string) {
  const { resolvedTheme } = useTheme()
  if (override) return override
  if (resolvedTheme === CurrentTheme.Light) return 'bg-backgroundCode'
  return 'bg-[#282c34]'
}

const Content = memo(
  ({
    language,
    children,
    action,
    className,
    copy = true,
    textWrap = true,
    bgColor: overrideBgColor,
  }: CodeBlockProps) => {
    const { resolvedTheme } = useTheme()
    const bgColor = useCodeBlockBackgroundColor(overrideBgColor)
    return (
      <div className={cn('w-full relative max-w-full', bgColor)}>
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
          className={cn('text-sm', className, {
            'break-words whitespace-pre-wrap [&>code]:!whitespace-pre-wrap':
              textWrap,
          })}
          wrapLongLines={textWrap}
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

export const CodeBlock = memo(({ children, ...rest }: CodeBlockProps) => {
  return (
    <ClientOnly>
      <Content {...rest}>{children}</Content>
    </ClientOnly>
  )
})
