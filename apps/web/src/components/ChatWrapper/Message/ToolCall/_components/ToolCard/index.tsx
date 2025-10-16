import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { ReactNode, useMemo, useState } from 'react'
import { ToolCardHeader } from './Header'
import { ToolCardInput, ToolCardOutput } from './Content'
import {
  Icon,
  IconName,
} from '../../../../../../../../../packages/web-ui/src/ds/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { Text } from '@latitude-data/web-ui/atoms/Text'

const statusColor = (status: 'pending' | 'success' | 'error'): TextColor => {
  switch (status) {
    case 'pending':
      return 'primary'
    case 'success':
      return 'success'
    case 'error':
      return 'destructive'
    default:
      return 'foreground'
  }
}

export function ToolCardIcon({
  name,
  status,
}: {
  name: IconName
  status: 'pending' | 'success' | 'error'
}) {
  return <Icon name={name} color={statusColor(status)} />
}

export function ToolCardText({ children }: { children: ReactNode }) {
  return (
    <Text.H5 noWrap ellipsis>
      {children}
    </Text.H5>
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
  const [_isOpen, setIsOpen] = useState(false)

  const isOpen = useMemo(() => {
    if (!toolResponse) return true
    return _isOpen
  }, [toolResponse, _isOpen])

  const status = useMemo(() => {
    if (!toolResponse) return 'pending'
    if (toolResponse.isError) return 'error'
    return 'success'
  }, [toolResponse])

  return (
    <div className='flex flex-col w-full rounded-xl border border-border overflow-hidden my-1'>
      <ToolCardHeader
        icon={headerIcon}
        label={headerLabel}
        status={status}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
      />
      {isOpen && <ToolCardInput toolRequest={toolRequest} />}
      {isOpen && <ToolCardOutput toolResponse={toolResponse} />}
    </div>
  )
}
