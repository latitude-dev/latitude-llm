import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { ReactNode, useEffect, useRef, useState } from 'react'

const MAX_HEIGHT = 400

function MaxHeightWindow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    if (!ref.current) return

    const observer = new ResizeObserver(() => {
      setIsOverflowing(ref.current!.scrollHeight > MAX_HEIGHT)
    })
    observer.observe(ref.current)

    return () => {
      observer.disconnect()
    }
  }, [children])

  return (
    <div
      className='flex flex-col overflow-hidden relative'
      style={{ maxHeight: isOpen ? 'unset' : MAX_HEIGHT }}
    >
      <div ref={ref} className='w-full h-fit'>
        {children}
      </div>

      {isOverflowing && !isOpen ? (
        <div className='absolute bottom-0 left-0 right-0 h-[80px] bg-gradient-to-t from-backgroundCode from-30% via-backgroundCode/70 via-60% to-transparent flex flex-col items-center justify-end p-0'>
          <Button
            variant='ghost'
            size='small'
            onClick={() => setIsOpen(true)}
            iconProps={{
              name: 'chevronDown',
              color: 'primary',
              placement: 'right',
            }}
          >
            <Text.H6 color='primary'>View more</Text.H6>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function ToolCardContentWrapper({
  badge,
  className,
  children,
}: {
  badge?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col w-full p-3 border-t border-border bg-backgroundCode',
        className,
      )}
    >
      {badge && (
        <div className='flex flex-row'>
          <Badge variant='outline'>{badge}</Badge>
        </div>
      )}
      <MaxHeightWindow>{children}</MaxHeightWindow>
    </div>
  )
}

export function ToolCardInput({
  toolRequest,
}: {
  toolRequest: ToolRequestContent
}) {
  return (
    <ToolCardContentWrapper badge='Input'>
      <CodeBlock language='json'>
        {JSON.stringify(toolRequest.args, null, 2)}
      </CodeBlock>
    </ToolCardContentWrapper>
  )
}

function toString(val: unknown): string {
  if (typeof val === 'string') return val
  return JSON.stringify(val, null, 2)
}

export function ToolCardOutput({
  toolResponse,
}: {
  toolResponse: ToolContent | undefined
}) {
  return (
    <ToolCardContentWrapper badge='Output'>
      {toolResponse ? (
        toolResponse.isError ? (
          <div className='w-full pt-3 items-center'>
            <Alert
              variant='destructive'
              title='Error'
              description={toString(toolResponse.result)}
            />
          </div>
        ) : (
          <CodeBlock language='json'>{toString(toolResponse.result)}</CodeBlock>
        )
      ) : (
        <div className='flex flex-row gap-2 items-center justify-center pb-3'>
          <Icon name='loader' color='foregroundMuted' spin />
          <Text.H6 color='foregroundMuted'>Running...</Text.H6>
        </div>
      )}
    </ToolCardContentWrapper>
  )
}
