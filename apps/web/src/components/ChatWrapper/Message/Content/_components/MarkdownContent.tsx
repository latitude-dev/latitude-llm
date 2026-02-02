import { memo, Ref, ReactNode, useMemo } from 'react'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Markdown, MarkdownSize } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import type { Components } from 'react-markdown'
import { ProseColor } from '@latitude-data/web-ui/tokens'
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
      className='px-1 no-underline inline-flex items-center gap-1'
    >
      <Text.H4 color='accentForeground'>{children}</Text.H4>
      <Icon name='externalLink' color='accentForeground' className='w-4 h-4' />
    </Link>
  )
}

export const MarkdownContent = memo(
  function MarkdownContent({
    className,
    text,
    color,
    size = 'md',
  }: {
    className?: string
    text: string
    size?: MarkdownSize
    color: ProseColor
  }) {
    const components = useMemo<Components>(
      () => ({
        a: ({ children, href }) => (
          <MarkdownLink href={href ?? '#'}>{children}</MarkdownLink>
        ),

        // @ts-expect-error - react-markdown passes an `inline` prop even though it’s not on HTMLElement attributes
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
                <Text.H5M>{content}</Text.H5M>
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
          <Image
            src={src}
            alt={alt}
            className='w-full h-full object-contain max-w-72 max-h-72 rounded-xl'
          />
        ),
      }),
      [],
    )

    return (
      <Markdown
        size={size}
        color={color}
        components={components}
        className={className}
      >
        {text}
      </Markdown>
    )
  },
  (prevProps, nextProps) =>
    prevProps.text === nextProps.text &&
    prevProps.color === nextProps.color &&
    prevProps.className === nextProps.className,
)
