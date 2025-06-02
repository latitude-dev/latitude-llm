import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Markdown } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactNode } from 'react'
import Link from 'next/link'
import React from 'react'

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
  if (href.includes('docs.latitude.so')) return 'bookMarked' // Docs
  if (!href.startsWith('/')) return 'externalLink' // External link

  // Latitude Document (/projects/:projectId/versions/:versionId/documents/:documentId...)
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
      className='bg-accent hover:bg-accent/75 rounded-sm px-1 no-underline inline-flex items-center gap-1'
    >
      {iconName && <Icon name={iconName} color='primary' className='w-4 h-4' />}
      <Text.H5B color='primary'>{children}</Text.H5B>
    </Link>
  )
}

export const MarkdownResponse = React.memo(
  function MarkdownResponse({ text }: { text: string }) {
    return (
      <Markdown
        className='text-muted-foreground'
        components={{
          h1: ({ children }) => (
            <Text.H3 color='foregroundMuted'>{children}</Text.H3>
          ),
          h2: ({ children }) => (
            <Text.H4B color='foregroundMuted'>{children}</Text.H4B>
          ),
          h3: ({ children }) => (
            <Text.H4 color='foregroundMuted'>{children}</Text.H4>
          ),

          p: ({ children }) => (
            <Text.H5 color='foregroundMuted'>{children}</Text.H5>
          ),
          strong: ({ children }) => (
            <Text.H5B color='foregroundMuted'>{children}</Text.H5B>
          ),

          a: ({ children, href }) => (
            <LatteLink href={href ?? '#'}>{children}</LatteLink>
          ),
          code: ({ children, className }) =>
            isCodeBlockInline(children as string, className) ? (
              <div className='bg-muted rounded-sm px-1 py-0.5 inline-flex flex-wrap'>
                <Text.H6M color='foregroundMuted'>{children}</Text.H6M>
              </div>
            ) : (
              <CodeBlock
                className='bg-background'
                language={getLanguageFromCodeBlock(className)}
                textWrap
              >
                {children as string}
              </CodeBlock>
            ),
          li: ({ children }) => (
            <li>
              <Text.H5 color='foregroundMuted'>{children}</Text.H5>
            </li>
          ),
          hr: () => <div className='w-full h-px bg-muted my-4' />,
        }}
      >
        {text}
      </Markdown>
    )
  },
  (prevProps, nextProps) => prevProps.text === nextProps.text,
)
