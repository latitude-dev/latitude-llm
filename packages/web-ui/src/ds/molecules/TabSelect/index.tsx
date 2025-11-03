'use client'

import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../../../lib/utils'
import { Button } from '../../atoms/Button'
import {
  FormControl,
  FormDescription,
  InlineFormErrorMessage,
} from '../../atoms/FormField'
import { Icon, IconName } from '../../atoms/Icons'
import { Label } from '../../atoms/Label'
import { Text } from '../../atoms/Text'

const ButtonBaseClassName =
  'w-full h-8 flex items-center justify-center gap-1 px-3 rounded-md'
const ButtonSelectableClassName = 'cursor-pointer pointer-events-auto'
const ButtonUnselectableClassName = 'cursor-default pointer-events-none'

export type TabSelectOption<V extends unknown = unknown> = {
  label: string
  value: V
  icon?: ReactNode | IconName
  suffix?: ReactNode
}

export function TabSelect<V extends unknown = unknown>({
  options,
  value,
  onChange,
  label,
  description,
  errors,
  className,
  fancy,
  disabled,
}: {
  options: TabSelectOption<V>[]
  value?: V
  onChange?: (value: V) => void
  name?: string
  label?: string
  description?: string | ReactNode
  errors?: string[] | null | undefined
  className?: string
  fancy?: boolean
  disabled?: boolean
  required?: boolean
}) {
  const [selected, setSelected] = useState(value)
  useEffect(() => setSelected(value), [value])

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

  const error = errors?.[0]
  const id = useId()
  const formItemId = `${id}-form-item`
  const formDescriptionId = `${id}-form-item-description`
  const formMessageId = `${id}-form-item-message`

  return (
    <div
      className={cn(
        'flex flex-col gap-y-2 w-full',
        { 'mt-[4px]': fancy },
        className,
      )}
    >
      <div
        className={cn('flex flex-col gap-y-2 w-full', {
          'h-11 bg-secondary rounded-xl border border-border': fancy,
        })}
        aria-describedby={
          !error
            ? `${formDescriptionId}`
            : `${formDescriptionId} ${formMessageId}`
        }
        aria-invalid={!!error}
      >
        {label && (
          <Label
            variant={error ? 'destructive' : 'default'}
            htmlFor={formItemId}
          >
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
              'bg-secondary rounded-lg border border-input',
              { '-mt-[4px] -mx-px rounded-xl': fancy },
            )}
          >
            <div
              className={cn(
                'absolute hidden bg-background rounded-md p-1 gap-2 border border-border transition-all duration-200 ease-in-out',
                { 'rounded-lg': fancy },
              )}
              ref={backgroundRef}
            />
            {options.map((option, index) => (
              <div key={index} className='flex flex-1'>
                <Button
                  ref={selected === option.value ? selectedRef : null}
                  type='button'
                  variant='ghost'
                  size='none'
                  className={cn(ButtonBaseClassName, {
                    [ButtonUnselectableClassName]: selected === option.value,
                    [ButtonSelectableClassName]: selected !== option.value,
                  })}
                  containerClassName={
                    selected === option.value
                      ? ButtonUnselectableClassName
                      : ButtonSelectableClassName
                  }
                  innerClassName={
                    selected === option.value
                      ? ButtonUnselectableClassName
                      : ButtonSelectableClassName
                  }
                  onClick={() => {
                    setSelected(option.value)
                    onChange?.(option.value)
                  }}
                  fullWidth={true}
                  disabled={disabled}
                >
                  <span className='flex flex-row items-center gap-x-2'>
                    {typeof option.icon === 'string' ? (
                      <Icon
                        name={option.icon as IconName}
                        color={
                          selected === option.value
                            ? 'foreground'
                            : 'foregroundMuted'
                        }
                        className='shrink-0'
                      />
                    ) : (
                      option.icon
                    )}
                    <Text.H5M
                      color={
                        selected === option.value
                          ? 'foreground'
                          : 'foregroundMuted'
                      }
                    >
                      <span className='transition-colors duration-200 ease-in-out'>
                        {option.label}
                      </span>
                    </Text.H5M>
                    {option.suffix}
                  </span>
                </Button>
              </div>
            ))}
          </div>
        </FormControl>
      </div>
      {description && <FormDescription>{description}</FormDescription>}
      <InlineFormErrorMessage error={error} id={formMessageId} />
    </div>
  )
}
