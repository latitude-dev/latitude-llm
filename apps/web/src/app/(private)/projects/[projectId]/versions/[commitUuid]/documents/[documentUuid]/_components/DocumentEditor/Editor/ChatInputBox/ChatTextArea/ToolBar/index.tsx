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
  onSubmit,
  onBack,
  disabledSubmit = false,
  disabledBack = false,
}: {
  onSubmit?: () => void
  onBack?: () => void
  disabledSubmit?: boolean
  disabledBack?: boolean
}) {
  return (
    <ToolBarWrapper>
      {!!onBack && (
        <Button
          variant='outline'
          disabled={disabledBack}
          onClick={onBack}
          fancy={true}
          roundy={true}
          userSelect={false}
        >
          Back to editor
        </Button>
      )}
      {!!onSubmit && (
        <Button
          disabled={disabledSubmit}
          onClick={onSubmit}
          iconProps={{
            name: 'forward',
            className: 'flex-shrink-0 rotate-180',
            placement: 'right',
          }}
          fancy={true}
          roundy={true}
          userSelect={false}
        >
          Send
        </Button>
      )}
    </ToolBarWrapper>
  )
}
