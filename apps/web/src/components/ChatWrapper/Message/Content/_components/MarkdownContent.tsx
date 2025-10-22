import { memo, Ref, ReactNode, useMemo } from 'react'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Markdown } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import type { Components } from 'react-markdown'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { Image } from '@latitude-data/web-ui/atoms/Image'

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

function MarkdownLink({
  children,
  href,
}: {
  children: ReactNode
  href: string
}) {
  return (
    <Link
      href={href}
      target={linkTarget(href)}
      className='bg-accent hover:bg-accent/75 rounded-sm px-1 no-underline inline-flex items-center gap-1'
    >
      <Icon name='externalLink' color='primary' className='w-4 h-4' />
      <Text.H4 color='primary'>{children}</Text.H4>
    </Link>
  )
}

export const MarkdownContent = memo(
  function MarkdownContent({
    className,
    text,
    color = 'foreground',
  }: {
    className?: string
    text: string
    color: TextColor
  }) {
    const components = useMemo<Components>(
      () => ({
        h1: ({ children }) => (
          <div className='block'>
            <Text.H2B color={color}>{children}</Text.H2B>
          </div>
        ),
        h2: ({ children }) => (
          <div className='block'>
            <Text.H2 color={color}>{children}</Text.H2>
          </div>
        ),
        h3: ({ children }) => (
          <div className='block'>
            <Text.H3 color={color}>{children}</Text.H3>
          </div>
        ),

        p: ({ children }) => <Text.H4 color={color}>{children}</Text.H4>,
        strong: ({ children }) => <Text.H4B color={color}>{children}</Text.H4B>,

        a: ({ children, href }) => (
          <MarkdownLink href={href ?? '#'}>{children}</MarkdownLink>
        ),

        // @ts-ignore: react-markdown passes an `inline` prop even though it’s not on HTMLElement attributes
        code: ({ inline, className, children, ...props }) => {
          const content = String(children)
          if (inline || isCodeBlockInline(content, className)) {
            const { ref, ...restProps } = props
            return (
              <div
                {...restProps}
                ref={ref as Ref<HTMLDivElement>}
                className='bg-backgroundCode rounded-sm px-1 py-0.5 inline-flex flex-wrap'
              >
                <Text.H5M color={color}>{content}</Text.H5M>
              </div>
            )
          }

          return (
            <CodeBlock
              {...props}
              bgColor='bg-backgroundCode'
              language={getLanguageFromCodeBlock(className)}
              textWrap
            >
              {content}
            </CodeBlock>
          )
        },

        img: ({ src, alt }) => (
          <Image src={src} alt={alt} className='w-full h-full object-contain' />
        ),

        li: ({ children }) => (
          <li>
            <Text.H4 color={color}>{children}</Text.H4>
          </li>
        ),
        hr: () => <div className='w-full h-px bg-muted my-4' />,
      }),
      [color],
    )

    return (
      <Markdown components={components} className={className}>
        {text}
      </Markdown>
    )
  },
  (prevProps, nextProps) =>
    prevProps.text === nextProps.text &&
    prevProps.color === nextProps.color &&
    prevProps.className === nextProps.className,
)
