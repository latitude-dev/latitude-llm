import {
  ToolRequestContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'
import { useMemo, useState } from 'react'
import { ToolCardHeader } from './Header'
import { ToolCardInput, ToolCardOutput } from './Content'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

export function ToolCard({
  toolRequest,
  toolResponse,
  customLabel,
  customIcon,
  customToolCallId,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  customLabel?: string
  customIcon?: IconName
  customToolCallId?: string
}) {
  const [_isOpen, setIsOpen] = useState(false)

  const isOpen = useMemo(() => {
    if (customToolCallId) return true
    return _isOpen
  }, [customToolCallId, _isOpen])

  const status = useMemo(() => {
    if (!toolResponse) return 'pending'
    if (toolResponse.isError) return 'error'
    return 'success'
  }, [toolResponse])

  return (
    <div className='flex flex-col w-full rounded-xl border border-border overflow-hidden my-1'>
      <ToolCardHeader
        toolRequest={toolRequest}
        status={status}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        customLabel={customLabel}
        customIcon={customIcon}
      />
      {isOpen && <ToolCardInput toolRequest={toolRequest} />}
      {isOpen && (
        <ToolCardOutput
          toolResponse={toolResponse}
          customToolCallId={customToolCallId}
        />
      )}
    </div>
  )
}
