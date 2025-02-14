import React, { forwardRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../../lib/utils'

export const Markdown = forwardRef<
  HTMLDivElement,
  { children: string; className?: string }
>(({ children, className }, ref) => {
  return (
    <div ref={ref} className='prose prose-sm'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className={cn(className, 'text-foreground')}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
