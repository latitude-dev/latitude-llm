'use client'

import { ComponentProps, Suspense, lazy } from 'react'
import { Prism as PrismHighlighter } from 'react-syntax-highlighter'
import { Text } from '../../Text'

type Props = Omit<ComponentProps<typeof PrismHighlighter>, 'style'> & {
  currentTheme?: string
}

const LazyPrism = lazy(() => import('./LazyPrism'))

export function SyntaxHighlighter({
  children,
  className,
  language,
  currentTheme,
}: Props) {
  return (
    <Suspense fallback={<Text.H5 animate>Loading code...</Text.H5>}>
      <LazyPrism
        className={className}
        language={language}
        currentTheme={currentTheme}
      >
        {children}
      </LazyPrism>
    </Suspense>
  )
}
