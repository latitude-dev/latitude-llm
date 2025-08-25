import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import { type ReactNode, useMemo } from 'react'

export function ToolBarWrapper({ children }: { children: ReactNode; className?: string }) {
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
  onClear,
  disabledSubmit = false,
  disabledClear = false,
}: {
  canChat: boolean
  onSubmit?: () => void
  onClear?: () => void
  disabledSubmit?: boolean
  disabledClear?: boolean
}) {
  return (
    <ToolBarWrapper>
      <Button
        variant={canChat ? 'outline' : 'default'}
        disabled={disabledClear}
        onClick={onClear}
        fancy={true}
        roundy={true}
        userSelect={false}
      >
        New chat
      </Button>
      {canChat && (
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
