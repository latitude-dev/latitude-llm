import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { ReactNode, useMemo, useState } from 'react'
import { ToolCardHeader } from './Header'
import type { ToolCallStatus } from './Header'
import { ToolCardInput, ToolCardOutput } from './Content'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'
import {
  AnnotatedTextRange,
  useAnnotations,
} from '$/components/ChatWrapper/AnnotationsContext'
import {
  isMainSpan,
  MainSpanType,
  SpanWithDetails,
} from '@latitude-data/constants'

export type { ToolCallStatus }

const statusColor = (status: ToolCallStatus | undefined): TextColor => {
  switch (status) {
    case 'running':
      return 'primary'
    case 'waiting':
      return 'foregroundMuted'
    case 'success':
      return 'success'
    case 'error':
      return 'destructive'
    default:
      return 'foregroundMuted'
  }
}

export function ToolCardIcon({
  name,
  status,
}: {
  name: IconName
  status?: ToolCallStatus
}) {
  return <Icon name={name} color={statusColor(status)} />
}

export function ToolCardText({
  color,
  children,
}: {
  color?: TextColor
  children: ReactNode
}) {
  return (
    <Text.H5 noWrap ellipsis color={color}>
      {children}
    </Text.H5>
  )
}

export function ToolCardWrapper({
  children,
  className,
  messageIndex,
  contentBlockIndex,
}: {
  children: ReactNode
  className?: string
  messageIndex?: number
  contentBlockIndex?: number
}) {
  const { getAnnotationsForBlock, evaluations = [], span } = useAnnotations()

  // Get annotations for this specific block
  const blockAnnotations = useMemo(() => {
    if (
      messageIndex === undefined ||
      contentBlockIndex === undefined ||
      !getAnnotationsForBlock ||
      !span ||
      !isMainSpan(span)
    ) {
      return []
    }
    return getAnnotationsForBlock(messageIndex, contentBlockIndex).filter(
      (ann: AnnotatedTextRange) => ann.context.contentType === 'tool-call',
    )
  }, [messageIndex, contentBlockIndex, getAnnotationsForBlock, span])

  const evaluation = evaluations[0]

  return (
    <div
      className={cn(
        'flex flex-col w-full rounded-xl border border-border overflow-hidden my-2 max-w-[800px]',
        className,
      )}
    >
      {children}
      {(blockAnnotations.length > 0 || evaluation) && span && (
        <div className='flex flex-col gap-y-4 border-t pt-4 px-4 pb-4'>
          {blockAnnotations.map((annotation: AnnotatedTextRange) => (
            <AnnotationForm
              key={`${annotation.result.uuid}-${annotation.evaluation.uuid}`}
              evaluation={annotation.evaluation}
              span={span as SpanWithDetails<MainSpanType>}
              result={annotation.result}
              initialExpanded={false}
            />
          ))}
          {!blockAnnotations.length &&
            evaluation &&
            messageIndex !== undefined &&
            contentBlockIndex !== undefined &&
            span !== undefined &&
            isMainSpan(span) && (
              <AnnotationForm
                evaluation={evaluation}
                span={span as SpanWithDetails<MainSpanType>}
                initialExpanded={false}
                selectedContext={{
                  messageIndex,
                  contentBlockIndex,
                  contentType: 'tool-call',
                }}
              />
            )}
        </div>
      )}
    </div>
  )
}

export function ToolCard({
  toolRequest,
  toolResponse,
  headerIcon,
  headerLabel,
  messageIndex,
  contentBlockIndex,
  status,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  headerIcon: ReactNode
  headerLabel: ReactNode
  messageIndex?: number
  contentBlockIndex?: number
  status: ToolCallStatus
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <ToolCardWrapper
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
    >
      <ToolCardHeader
        icon={headerIcon}
        label={headerLabel}
        status={status}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        simulated={toolRequest._sourceData?.simulated}
      />
      {isOpen && <ToolCardInput toolRequest={toolRequest} />}
      {isOpen && (
        <ToolCardOutput
          toolResponse={toolResponse}
          simulated={toolRequest._sourceData?.simulated}
          status={status}
        />
      )}
    </ToolCardWrapper>
  )
}
