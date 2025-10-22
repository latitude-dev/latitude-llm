import { forwardRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkEmoji from 'remark-emoji'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkBreaks from 'remark-breaks'
import { cn } from '../../../lib/utils'
import { colors, ProseColor } from '../../tokens'

export const Markdown = forwardRef<
  HTMLDivElement,
  {
    children: string
    color: ProseColor
    size: 'sm' | 'md' | 'lg'
    className?: string
    components?: Components
  }
>(({ children, className, size, components, color }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'prose max-w-none w-full text-start',
        colors.proseColors[color],
        {
          'prose-sm': size === 'sm',
          'prose-md': size === 'md',
          'prose-lg': size === 'lg',
        },
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkEmoji, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={components}
        className={className}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
