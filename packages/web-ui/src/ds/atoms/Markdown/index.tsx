import { forwardRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkEmoji from 'remark-emoji'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkBreaks from 'remark-breaks'
import { cn } from '../../../lib/utils'

export const Markdown = forwardRef<
  HTMLDivElement,
  { children: string; className?: string; components?: Components }
>(({ children, className, components }, ref) => {
  return (
    <div
      ref={ref}
      className='prose prose-sm max-w-none w-full flex flex-col gap-2'
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkEmoji, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={components}
        className={cn(className, 'text-foreground')}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
