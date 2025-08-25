import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Icon, type IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Markdown } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import React, { type ReactNode, useMemo } from 'react'
import type { Components } from 'react-markdown'

function isCodeBlockInline(children: string, className?: string) {
  return className === undefined && !children.includes('\n')
}

function getLanguageFromCodeBlock(className?: string) {
  if (!className) return 'plaintext'
  return className.replace('language-', '')
}

function linkTarget(href: string): '_blank' | undefined {
  return href.startsWith('/') ? undefined : '_blank'
}

function linkIcon(href: string): IconName | undefined {
  if (href.includes('docs.latitude.so')) return 'bookMarked'
  if (!href.startsWith('/')) return 'externalLink'
  if (href.match(/^\/projects\/[^/]+\/versions\/[^/]+\/documents\/[^/]+\/?$/)) {
    return 'file'
  }
}

function LatteLink({ children, href }: { children: ReactNode; href: string }) {
  const iconName = linkIcon(href)

  return (
    <Link
      href={href}
      target={linkTarget(href)}
      className='bg-latte-input hover:bg-latte-input/75 rounded-sm px-1 no-underline inline-flex items-center gap-1'
    >
      {iconName && <Icon name={iconName} color='latteInputForeground' className='w-4 h-4' />}
      <Text.H5B color='latteInputForeground'>{children}</Text.H5B>
    </Link>
  )
}

export const MarkdownResponse = React.memo(
  function MarkdownResponse({ text }: { text: string }) {
    const components = useMemo<Components>(
      () => ({
        h1: ({ children }) => (
          <div className='block'>
            <Text.H3 color='latteOutputForeground'>{children}</Text.H3>
          </div>
        ),
        h2: ({ children }) => (
          <div className='block'>
            <Text.H4B color='latteOutputForeground'>{children}</Text.H4B>
          </div>
        ),
        h3: ({ children }) => (
          <div className='block'>
            <Text.H4 color='latteOutputForeground'>{children}</Text.H4>
          </div>
        ),

        p: ({ children }) => <Text.H5 color='latteOutputForeground'>{children}</Text.H5>,
        strong: ({ children }) => <Text.H5B color='latteOutputForeground'>{children}</Text.H5B>,

        a: ({ children, href }) => <LatteLink href={href ?? '#'}>{children}</LatteLink>,

        // @ts-ignore: react-markdown passes an `inline` prop even though it’s not on HTMLElement attributes
        code: ({ inline, className, children, ...props }) => {
          const content = String(children)
          if (inline || isCodeBlockInline(content, className)) {
            const { ref, ...restProps } = props
            return (
              <div
                {...restProps}
                ref={ref as React.LegacyRef<HTMLDivElement>}
                className='bg-latte-background rounded-sm px-1 py-0.5 inline-flex flex-wrap'
              >
                <Text.H6M color='latteInputForeground'>{content}</Text.H6M>
              </div>
            )
          }

          return (
            <CodeBlock
              {...props}
              bgColor='bg-latte-widget'
              language={getLanguageFromCodeBlock(className)}
              textWrap
            >
              {content}
            </CodeBlock>
          )
        },

        li: ({ children }) => (
          <li>
            <Text.H5 color='latteOutputForeground'>{children}</Text.H5>
          </li>
        ),
        hr: () => <div className='w-full h-px bg-muted my-4' />,
      }),
      [],
    )

    return (
      <Markdown className='text-latte-output-foreground' components={components}>
        {text}
      </Markdown>
    )
  },
  (prevProps, nextProps) => prevProps.text === nextProps.text,
)
