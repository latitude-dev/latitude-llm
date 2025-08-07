import { forwardRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../../lib/utils'

export const Markdown = forwardRef<
  HTMLDivElement,
  { children: string; className?: string; components?: Components }
>(({ children, className, components }, ref) => {
  return (
    <div ref={ref} className='prose prose-sm'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className={cn(className, 'text-foreground')}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
