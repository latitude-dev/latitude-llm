import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { ReactNode, useMemo, useState } from 'react'
import { ToolCardHeader } from './Header'
import { ToolCardInput, ToolCardOutput } from './Content'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

const statusColor = (
  status: 'pending' | 'success' | 'error' | undefined,
): TextColor => {
  switch (status) {
    case 'pending':
      return 'primary'
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
  status?: 'pending' | 'success' | 'error'
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
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col w-full rounded-xl border border-border overflow-hidden my-2 max-w-[800px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ToolCard({
  toolRequest,
  toolResponse,
  headerIcon,
  headerLabel,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  headerIcon: ReactNode
  headerLabel: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  const status = useMemo(() => {
    if (!toolResponse) return 'pending'
    if (toolResponse.isError) return 'error'
    return 'success'
  }, [toolResponse])

  return (
    <ToolCardWrapper>
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
        />
      )}
    </ToolCardWrapper>
  )
}
