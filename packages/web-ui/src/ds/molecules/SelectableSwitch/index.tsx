'use client'
import { ReactNode, useEffect, useId, useRef, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Button } from '../../atoms/Button'
import { Label } from '../../atoms/Label'
import { Text } from '../../atoms/Text'
import {
  FormControl,
  FormDescription,
  InlineFormErrorMessage,
} from '../../atoms/FormField'

const ButtonBaseClassName =
  'w-full h-8 flex items-center justify-center gap-1 px-3 rounded-md'
const ButtonSelectableClassName = 'cursor-pointer pointer-events-auto'
const ButtonUnselectableClassName = 'cursor-default pointer-events-none'

export function SelectableSwitch({
  trueLabel,
  falseLabel,
  selected: defaultSelected,
  onChange,
  label,
  description,
  errors,
  className,
  disabled,
}: {
  trueLabel: string
  falseLabel: string
  selected?: boolean
  onChange?: (value: boolean) => void
  name?: string
  label?: string
  description?: string | ReactNode
  errors?: string[] | null | undefined
  className?: string
  disabled?: boolean
  required?: boolean
}) {
  const [selected, setSelected] = useState(!!defaultSelected)
  useEffect(() => setSelected(!!defaultSelected), [defaultSelected])

  const selectedRef = useRef<HTMLButtonElement>(null)
  const backgroundRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const background = backgroundRef?.current
    if (!background) return

    const button = selectedRef?.current
    if (!button) {
      background.style.display = 'none'
      return
    }

    const updateBackgroundPosition = () => {
      background.style.top = `${button.offsetTop}px`
      background.style.left = `${button.offsetLeft}px`
      background.style.width = `${button.offsetWidth}px`
      background.style.height = `${button.offsetHeight}px`
      background.style.display = 'block'
    }

    updateBackgroundPosition()
    const resizeObserver = new ResizeObserver(updateBackgroundPosition)
    resizeObserver.observe(button)

    return () => resizeObserver.disconnect()
  }, [selected])

  const TrueButtonClassName = !selected
    ? ButtonSelectableClassName
    : ButtonUnselectableClassName
  const FalseButtonClassName = selected
    ? ButtonSelectableClassName
    : ButtonUnselectableClassName

  const error = errors?.[0]
  const id = useId()
  const formItemId = `${id}-form-item`
  const formDescriptionId = `${id}-form-item-description`
  const formMessageId = `${id}-form-item-message`

  return (
    <div
      className={cn('flex flex-col gap-y-2 w-full', className)}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
    >
      {label && (
        <Label variant={error ? 'destructive' : 'default'} htmlFor={formItemId}>
          {label}
        </Label>
      )}
      <FormControl
        error={error}
        formItemId={formItemId}
        formDescriptionId={formDescriptionId}
        formMessageId={formMessageId}
      >
        <div
          className={cn(
            'relative flex flex-row justify-between gap-2 p-1 w-[calc(100%+2px)]',
            'bg-background rounded-lg border border-input',
          )}
        >
          <div
            className='absolute hidden bg-primary rounded-md p-1 gap-2 transition-all duration-200 ease-in-out'
            ref={backgroundRef}
          />
          <div className='flex flex-1'>
            <Button
              ref={selected ? selectedRef : null}
              type='button'
              variant='ghost'
              size='none'
              className={cn(ButtonBaseClassName, TrueButtonClassName)}
              containerClassName={TrueButtonClassName}
              innerClassName={TrueButtonClassName}
              onClick={() => {
                setSelected(true)
                onChange?.(true)
              }}
              fullWidth={true}
              disabled={disabled}
            >
              <Text.H5M color={selected ? 'background' : 'foregroundMuted'}>
                <span className='transition-colors duration-200 ease-in-out'>
                  {trueLabel}
                </span>
              </Text.H5M>
            </Button>
          </div>
          <div className='flex flex-1'>
            <Button
              ref={!selected ? selectedRef : null}
              type='button'
              variant='ghost'
              size='none'
              className={cn(ButtonBaseClassName, FalseButtonClassName)}
              containerClassName={FalseButtonClassName}
              innerClassName={FalseButtonClassName}
              onClick={() => {
                setSelected(false)
                onChange?.(false)
              }}
              fullWidth={true}
              disabled={disabled}
            >
              <Text.H5M color={!selected ? 'background' : 'foregroundMuted'}>
                <span className='transition-colors duration-200 ease-in-out'>
                  {falseLabel}
                </span>
              </Text.H5M>
            </Button>
          </div>
        </div>
      </FormControl>
      {description && <FormDescription>{description}</FormDescription>}
      <InlineFormErrorMessage error={error} id={formMessageId} />
    </div>
  )
}
