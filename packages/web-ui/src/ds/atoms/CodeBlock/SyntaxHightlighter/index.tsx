'use client'

import { ComponentProps, Suspense, lazy } from 'react'
import { Prism as PrismHighlighter } from 'react-syntax-highlighter'
import { Skeleton } from '../../Skeleton'

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
    <Suspense fallback={<Skeleton height='h5' />}>
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
