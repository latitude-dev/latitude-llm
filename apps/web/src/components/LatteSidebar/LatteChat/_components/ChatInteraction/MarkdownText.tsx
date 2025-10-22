import { memo, LegacyRef, ReactNode, useMemo } from 'react'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Markdown } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
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
      {iconName && (
        <Icon
          name={iconName}
          color='latteInputForeground'
          className='w-4 h-4'
        />
      )}
      <Text.H5B color='latteInputForeground'>{children}</Text.H5B>
    </Link>
  )
}

export const MarkdownResponse = memo(
  function MarkdownResponse({ text }: { text: string }) {
    const components = useMemo<Components>(
      () => ({
        a: ({ children, href }) => (
          <LatteLink href={href ?? '#'}>{children}</LatteLink>
        ),

        // @ts-ignore: react-markdown passes an `inline` prop even though it’s not on HTMLElement attributes
        code: ({ inline, className, children, ...props }) => {
          const content = String(children)
          if (inline || isCodeBlockInline(content, className)) {
            const { ref, ...restProps } = props
            return (
              <div
                {...restProps}
                ref={ref as LegacyRef<HTMLDivElement>}
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
      }),
      [],
    )

    return (
      <Markdown
        color='latte'
        size='md'
        className='text-latte-output-foreground'
        components={components}
      >
        {text}
      </Markdown>
    )
  },
  (prevProps, nextProps) => prevProps.text === nextProps.text,
)
