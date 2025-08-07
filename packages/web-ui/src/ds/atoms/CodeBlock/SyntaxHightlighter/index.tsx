'use client'

import React, {
  ComponentProps,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { CurrentTheme } from '../../../../constants'
import { cn } from '../../../../lib/utils'

const LazyPrism = lazy(() =>
  import('react-syntax-highlighter').then((mod) => ({ default: mod.Prism })),
)

type PrismThemeStyle = { [key: string]: React.CSSProperties } | undefined

type Props = Omit<ComponentProps<typeof LazyPrism>, 'style'> & {
  currentTheme: string | undefined
}

export function SyntaxHighlighter({
  children,
  className,
  language,
  currentTheme,
}: Props) {
  const [style, setStyle] = useState<PrismThemeStyle>(undefined)
  useEffect(() => {
    let active = true

    const loadTheme = async () => {
      let themeModule
      if (currentTheme === CurrentTheme.Dark) {
        themeModule = await import(
          'react-syntax-highlighter/dist/esm/styles/prism/one-dark'
        )
      } else {
        themeModule = await import(
          'react-syntax-highlighter/dist/esm/styles/prism/one-light'
        )
      }

      if (active) {
        setStyle(themeModule.default)
      }
    }
    loadTheme()

    return () => {
      active = false
    }
  }, [currentTheme])

  return (
    <Suspense
      fallback={<div className='p-4 text-sm text-muted'>Loading code...</div>}
    >
      <LazyPrism
        className={cn('text-sm', className)}
        language={language}
        style={style}
        customStyle={{
          borderRadius: '0.375rem',
          padding: '1rem',
          lineHeight: '1.25rem',
          margin: '0',
        }}
      >
        {useMemo(() => children, [children])}
      </LazyPrism>
    </Suspense>
  )
}
