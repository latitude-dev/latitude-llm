import {
  ComponentPropsWithRef,
  ElementRef,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useId,
} from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '../../../lib/utils'
import { TooltipLabel } from '../Label'
import Text from '../Text'
import { Tooltip } from '../Tooltip'

export function FormDescription({
  children,
}: {
  children: string | ReactNode
}) {
  if (typeof children !== 'string') return children

  return <Text.H6 color='foregroundMuted'>{children}</Text.H6>
}

function TooltipMessage({ error }: { error: string | undefined }) {
  if (!error) return null

  return error
}

export function InlineFormErrorMessage({
  error,
  id,
}: {
  id: string
  error: string | undefined
}) {
  if (!error) return null

  return (
    <p id={id} className='text-[0.8rem] font-medium text-destructive'>
      {error}
    </p>
  )
}

export const FormControl = forwardRef<
  ElementRef<typeof Slot>,
  ComponentPropsWithRef<typeof Slot> & {
    error?: string | undefined
    formItemId: string
    formDescriptionId: string
    formMessageId: string
  }
>(({ error, formItemId, formMessageId, formDescriptionId, ...props }, _ref) => {
  return (
    <Slot
      ref={props.ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
})

function DescriptionAndError({
  description,
  error,
  errorStyle,
  formMessageId,
}: {
  description: ReactNode | string | undefined
  error: string | undefined
  formMessageId: string
  errorStyle: ErrorStyle
}) {
  return (
    <>
      {description && <FormDescription>{description}</FormDescription>}
      {errorStyle === 'inline' ? (
        <InlineFormErrorMessage error={error} id={formMessageId} />
      ) : null}
    </>
  )
}

type ErrorStyle = 'inline' | 'tooltip'
type InputWrapperProps = {
  children: ReactNode
  description: ReactNode | string | undefined
  error: string | undefined
  formItemId: string
  formDescriptionId: string
  formMessageId: string
  label?: string | ReactNode
  badgeLabel?: boolean
  info?: string
  errorStyle?: ErrorStyle
}

/**
 * Used for checkbox and radio buttons
 * where label is inline with the form input element.
 */
function InlineInput({
  children,
  label,
  formItemId,
  badgeLabel,
  info,
  error,
  description,
  formDescriptionId,
  formMessageId,
}: InputWrapperProps) {
  if (!label) {
    return (
      <div className='flex flex-row gap-2 items-center'>
        <FormControl
          error={error}
          formItemId={formItemId}
          formDescriptionId={formDescriptionId}
          formMessageId={formMessageId}
        >
          {children}
        </FormControl>
        <DescriptionAndError
          description={description}
          error={error}
          errorStyle='inline'
          formMessageId={formMessageId}
        />
      </div>
    )
  }

  const hasSubcontent = error || description || label
  return (
    <TooltipLabel
      inline
      htmlFor={formItemId}
      badgeLabel={badgeLabel}
      info={info}
      error={error}
    >
      <div
        className={cn('flex flex-row gap-x-2', {
          'items-center': !hasSubcontent,
        })}
      >
        <FormControl
          className='relative top-0.5'
          error={error}
          formItemId={formItemId}
          formDescriptionId={formDescriptionId}
          formMessageId={formMessageId}
        >
          {children}
        </FormControl>
        <div className='flex flex-col gap-y-1 w-full items-center'>
          <div className='cursor-pointer'>{label}</div>
          <DescriptionAndError
            description={description}
            error={error}
            errorStyle='inline'
            formMessageId={formMessageId}
          />
        </div>
      </div>
    </TooltipLabel>
  )
}

function StackInput({
  children,
  label,
  formItemId,
  badgeLabel,
  info,
  error,
  formDescriptionId,
  formMessageId,
  description,
}: InputWrapperProps) {
  return (
    <>
      {label ? (
        <TooltipLabel
          htmlFor={formItemId}
          badgeLabel={badgeLabel}
          info={info}
          error={error}
        >
          {label}
        </TooltipLabel>
      ) : null}
      <FormControl
        error={error}
        formItemId={formItemId}
        formDescriptionId={formDescriptionId}
        formMessageId={formMessageId}
      >
        {children}
      </FormControl>
      <DescriptionAndError
        description={description}
        error={error}
        errorStyle='inline'
        formMessageId={formMessageId}
      />
    </>
  )
}

export type FormFieldProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> & {
  children: ReactNode
  label?: string | ReactNode
  badgeLabel?: boolean
  description?: string | ReactNode
  info?: string
  inline?: boolean
  errors?: string[] | null | undefined
  errorStyle?: ErrorStyle
  autoGrow?: boolean
  fullWidth?: boolean
}
function FormField({
  children,
  label,
  badgeLabel = false,
  description,
  className,
  errors,
  errorStyle = 'inline',
  info,
  autoGrow = false,
  fullWidth = true,
  inline = false,
}: FormFieldProps) {
  const error = errors?.[0]
  const id = useId()
  const formItemId = `${id}-form-item`
  const formDescriptionId = `${id}-form-item-description`
  const formMessageId = `${id}-form-item-message`
  const InputCmp = inline ? InlineInput : StackInput
  const input = (
    <div
      className={cn(
        'space-y-2',
        {
          'h-full': autoGrow,
          'w-full': fullWidth,
        },
        className,
      )}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
    >
      <InputCmp
        label={label}
        formItemId={formItemId}
        badgeLabel={badgeLabel}
        info={info}
        error={error}
        description={description}
        formDescriptionId={formDescriptionId}
        formMessageId={formMessageId}
      >
        {children}
      </InputCmp>
    </div>
  )

  if (errorStyle !== 'tooltip') return input

  return (
    <Tooltip side='bottom' align='start' asChild open={!!error} trigger={input}>
      <TooltipMessage error={error} />
    </Tooltip>
  )
}

export { FormField }
