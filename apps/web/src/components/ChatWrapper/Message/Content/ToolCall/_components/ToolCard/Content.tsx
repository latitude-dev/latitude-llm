import { MaxHeightWindow } from '$/components/MaxHeightWindow'
import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { stringifyUnknown } from '@latitude-data/web-ui/textUtils'
import { cn } from '@latitude-data/web-ui/utils'
import { ReactNode } from 'react'

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
        {stringifyUnknown(toolRequest.args)}
      </CodeBlock>
    </ToolCardContentWrapper>
  )
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
              description={stringifyUnknown(toolResponse.result)}
            />
          </div>
        ) : (
          <CodeBlock language='json'>
            {stringifyUnknown(toolResponse.result)}
          </CodeBlock>
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
