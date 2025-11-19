'use client'

import { Button, ButtonProps } from '../../atoms/Button'

export function DoubleButton({
  leftButton,
  leftButtonText,
  rightButton,
  rightButtonText,
}: {
  leftButton: ButtonProps
  leftButtonText: string
  rightButton: ButtonProps
  rightButtonText: string
}) {
  return (
    <div className='flex flex-row p-1 justify-between gap-x-1 rounded-lg border border-border w-full'>
      <Button {...leftButton} containerClassName='flex-1'>
        {leftButtonText}
      </Button>
      <Button {...rightButton} containerClassName='flex-1'>
        {rightButtonText}
      </Button>
    </div>
  )
}
