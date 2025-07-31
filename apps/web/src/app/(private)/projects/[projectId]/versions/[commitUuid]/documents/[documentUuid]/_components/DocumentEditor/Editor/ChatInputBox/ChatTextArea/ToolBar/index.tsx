import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import { ReactNode, useMemo } from 'react'

export function ToolBarWrapper({
  children,
}: {
  children: ReactNode
  className?: string
}) {
  return useMemo(
    () => (
      <FloatingPanel visible>
        <div className='flex flex-row gap-2 items-center'>{children}</div>
      </FloatingPanel>
    ),
    [children],
  )
}

export function ToolBar({
  canChat,
  onSubmit,
  clearChat,
  disabled = false,
  submitLabel = 'Send Message',
  disableReset = false,
}: {
  canChat: boolean
  onSubmit?: () => void
  clearChat?: () => void
  disabled?: boolean
  submitLabel?: string
  disableReset?: boolean
}) {
  return (
    <ToolBarWrapper>
      <Button
        fancy
        variant={canChat ? 'outline' : 'default'}
        disabled={disableReset}
        onClick={clearChat}
      >
        Reset Chat
      </Button>
      {canChat ? (
        <Button fancy disabled={disabled} onClick={onSubmit}>
          {submitLabel}
        </Button>
      ) : null}
    </ToolBarWrapper>
  )
}
