import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import { MouseEvent, useCallback } from 'react'

export function MainPromptIcon({
  isFile,
  isHovered,
  isMainDocument,
  setMainDocument,
}: {
  isFile: boolean
  isHovered: boolean
  isMainDocument?: boolean
  setMainDocument?: (isMainDocument: boolean) => void
}) {
  const onClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      // This button is inside a Link. Avoid the link to be triggered:
      event.preventDefault()
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation()

      setMainDocument?.(!isMainDocument)
    },
    [setMainDocument, isMainDocument],
  )

  if (!isFile) return null
  if (isMainDocument === undefined) return null

  return (
    <Tooltip
      asChild
      trigger={
        <Button
          variant='ghost'
          className={cn('p-0 w-4 h-4 leading-none min-h-0', {
            'opacity-0': !isMainDocument && !isHovered,
          })}
          onClick={onClick}
          onPointerDownCapture={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          iconProps={{
            name: 'squareArrowRight',
            color: isMainDocument ? 'primary' : 'foregroundMuted',
            className: 'w-4 h-4 leading-none',
          }}
        ></Button>
      }
    >
      {isMainDocument ? 'Unset as main prompt' : 'Set as main prompt'}
    </Tooltip>
  )
}
