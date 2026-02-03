import { MaxHeightWindow } from '$/components/MaxHeightWindow'
import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/messages'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { stringifyUnknown } from '@latitude-data/web-ui/textUtils'
import { cn } from '@latitude-data/web-ui/utils'
import { ReactNode } from 'react'
import { SimulationTag } from './SimulationTag'
import { ToolCallStatus } from './Header'

export function ToolCardContentWrapper({
  badge,
  simulated,
  className,
  children,
}: {
  badge?: string
  simulated?: boolean
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
      {(badge || simulated) && (
        <div className='flex flex-row gap-2'>
          {badge && <Badge variant='outline'>{badge}</Badge>}
          {simulated && <SimulationTag />}
        </div>
      )}
      <MaxHeightWindow>{children}</MaxHeightWindow>
    </div>
  )
}

export function ToolCardPendingState({
  status,
  loadingText,
}: {
  status: ToolCallStatus
  loadingText: string
}) {
  return (
    <ToolCardContentWrapper>
      <div className='flex flex-row gap-2 items-center justify-center pb-3'>
        {status === 'running' ? (
          <>
            <Icon name='loader' color='foregroundMuted' spin />
            <Text.H5 color='foregroundMuted'>{loadingText}</Text.H5>
          </>
        ) : (
          <>
            <Icon name='clock' color='foregroundMuted' />
            <Text.H5 color='foregroundMuted'>Tool not executed yet</Text.H5>
          </>
        )}
      </div>
    </ToolCardContentWrapper>
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
  simulated,
  status,
}: {
  toolResponse: ToolContent | undefined
  simulated?: boolean
  status?: ToolCallStatus
}) {
  return (
    <ToolCardContentWrapper badge='Output' simulated={simulated}>
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
      ) : status === 'running' ? (
        <div className='flex flex-row gap-2 items-center justify-center pb-3'>
          <Icon name='loader' color='foregroundMuted' spin />
          <Text.H6 color='foregroundMuted'>Running...</Text.H6>
        </div>
      ) : (
        <div className='flex flex-row gap-2 items-center justify-center pb-3'>
          <Icon name='clock' color='foregroundMuted' />
          <Text.H6 color='foregroundMuted'>Tool not executed yet</Text.H6>
        </div>
      )}
    </ToolCardContentWrapper>
  )
}
