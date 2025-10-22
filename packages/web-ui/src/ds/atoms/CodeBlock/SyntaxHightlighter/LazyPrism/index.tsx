'use client'
import { Prism as PrismHighlighter } from 'react-syntax-highlighter'
import { CurrentTheme } from '../../../../../constants'
import { ComponentProps, use } from 'react'
import { cn } from '../../../../../lib/utils'

type Props = Omit<ComponentProps<typeof PrismHighlighter>, 'style'> & {
  currentTheme?: string
}

const darkThemePromise = import(
  'react-syntax-highlighter/dist/esm/styles/prism/one-dark'
).then((module) => module.default)

const lightThemePromise = import(
  'react-syntax-highlighter/dist/esm/styles/prism/one-light'
).then((module) => module.default)

export default function LazyPrism({
  children,
  className,
  language,
  currentTheme,
}: Props) {
  const style = use(
    currentTheme === CurrentTheme.Dark ? darkThemePromise : lightThemePromise,
  )

  return (
    <PrismHighlighter
      language={language}
      style={style}
      className={cn('text-xs', className)}
      customStyle={{
        borderRadius: '0.375rem',
        padding: '1rem',
        lineHeight: '1.25rem',
        margin: '0',
      }}
    >
      {children}
    </PrismHighlighter>
  )
}
