import { ReactNode } from 'react'
import { Button } from '../../../../atoms/Button'
import { FloatingPanel } from '../../../../atoms/FloatingPanel'

export function ToolBarWrapper({
  children,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <FloatingPanel visible>
      <div className='flex flex-row gap-2 items-center'>{children}</div>
    </FloatingPanel>
  )
}

export function ToolBar({
  onSubmit,
  clearChat,
  disabled = false,
  submitLabel = 'Send Message',
  disableReset = false,
}: {
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
        variant='outline'
        disabled={disableReset}
        onClick={clearChat}
      >
        Reset Chat
      </Button>
      <Button fancy disabled={disabled} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </ToolBarWrapper>
  )
}
