'use client'

import * as SwitchPrimitives from '@radix-ui/react-switch'
import {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'

import { cn } from '../../../lib/utils'
import { ButtonStylesProps, useButtonStyles } from '../Button'
import {
  FormControl,
  FormDescription,
  InlineFormErrorMessage,
} from '../FormField'
import { Icon, IconProps } from '../Icons'
import { Label } from '../Label'

type ToogleProps = ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
  size?: 'normal'
}
const SwitchToggle = forwardRef<
  ElementRef<typeof SwitchPrimitives.Root>,
  ToogleProps
>(({ className, size = 'normal', ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent-button dark:data-[state=checked]:bg-white/20',
      'data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-muted-foreground',
      className,
      {
        'h-4 w-8': size === 'normal',
      },
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block rounded-full bg-white shadow-lg',
        'ring-0 transition-transform data-[state=unchecked]:translate-x-0',
        {
          'h-3 w-3 data-[state=checked]:translate-x-4 ': size === 'normal',
        },
      )}
    />
  </SwitchPrimitives.Root>
))

SwitchToggle.displayName = SwitchPrimitives.Root.displayName

function useCheckedState({
  checked,
  defaultChecked,
  onCheckedChange,
}: {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  const [isChecked, setIsChecked] = useState(!!defaultChecked)

  useEffect(() => {
    if (checked !== undefined) {
      setIsChecked(checked)
    }
  }, [checked])

  const onChange = useCallback(
    (checked: boolean) => {
      setIsChecked(checked)
      onCheckedChange?.(checked)
    },
    [setIsChecked, onCheckedChange],
  )
  return useMemo(() => ({ isChecked, onChange }), [isChecked, onChange])
}

type Props = ToogleProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
    label?: string
    description?: string | ReactNode
    errors?: string[] | null | undefined
    name?: string
    checked?: boolean
    defaultChecked?: boolean
    fullWidth?: boolean
    innerClassName?: string
    inverted?: boolean
  }
function SwitchInput({
  className,
  label,
  errors,
  description,
  name,
  checked,
  defaultChecked,
  fullWidth = true,
  innerClassName,
  inverted = false,
  ...rest
}: Props) {
  const error = errors?.[0]
  const id = useId()
  const formItemId = `${id}-form-item`
  const formDescriptionId = `${id}-form-item-description`
  const formMessageId = `${id}-form-item-message`
  const { isChecked, onChange } = useCheckedState({
    checked: checked,
    defaultChecked,
    onCheckedChange: rest.onCheckedChange,
  })

  return (
    <div
      className={cn('flex flex-col gap-y-2', className, {
        'w-full': fullWidth,
      })}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
    >
      <div className='flex flex-row items-center gap-x-2 w-full'>
        {inverted && label ? (
          <Label
            variant={error ? 'destructive' : 'default'}
            htmlFor={formItemId}
          >
            {label}
          </Label>
        ) : null}
        <FormControl
          error={error}
          formItemId={formItemId}
          formDescriptionId={formDescriptionId}
          formMessageId={formMessageId}
        >
          <div className='flex items-center'>
            <input
              type='hidden'
              name={name}
              value={isChecked ? 'true' : 'false'}
            />
            <SwitchToggle
              {...rest}
              id={formItemId}
              checked={isChecked}
              onCheckedChange={onChange}
              className={innerClassName}
            />
          </div>
        </FormControl>
        {!inverted && label ? (
          <Label
            variant={error ? 'destructive' : 'default'}
            htmlFor={formItemId}
          >
            {label}
          </Label>
        ) : null}
      </div>
      {description && <FormDescription>{description}</FormDescription>}

      <InlineFormErrorMessage error={error} id={formMessageId} />
    </div>
  )
}

type FancySwitchProps = ToogleProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
    iconProps: IconProps
    buttonProps: ButtonStylesProps
    loading?: boolean
  }

function FancySwitchToggle({
  iconProps,
  buttonProps,
  checked,
  onCheckedChange,
  disabled,
  loading,
  ...rest
}: FancySwitchProps) {
  const isDisabled = disabled || loading

  const buttonStyles = useButtonStyles({
    ...buttonProps,
    containerClassName: cn(buttonProps.containerClassName, {
      'cursor-pointer': !isDisabled,
      'cursor-not-allowed': isDisabled,
    }),
    lookDisabled: isDisabled,
  })

  return (
    <div
      className={buttonStyles.container}
      onClick={() => !isDisabled && onCheckedChange?.(!checked)}
    >
      <div className={buttonStyles.buttonClass}>
        <div className={buttonStyles.innerButtonClass}>
          {loading ? (
            <Icon
              name='loader'
              color={iconProps.color}
              className='animate-spin'
            />
          ) : (
            <Icon {...iconProps} />
          )}

          <SwitchToggle
            {...rest}
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={isDisabled}
          />
        </div>
      </div>
    </div>
  )
}

export { FancySwitchToggle, SwitchInput, SwitchToggle }
