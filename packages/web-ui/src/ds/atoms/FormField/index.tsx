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
import { Icon } from '../Icons'
import { BatchLabel, Label } from '../Label'
import Text from '../Text'
import { Tooltip } from '../Tooltip'

export function FormDescription({
  id,
  children,
  ...props
}: {
  id: string
  children: string | ReactNode
} & HTMLAttributes<HTMLParagraphElement>) {
  if (typeof children !== 'string') return children

  return (
    <p id={id} className='text-[0.8rem] text-muted-foreground' {...props}>
      {children}
    </p>
  )
}

function TooltipMessage({ error }: { error: string | undefined }) {
  if (!error) return null

  return <Text.H6B color='foreground'>{error}</Text.H6B>
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

export type FormFieldProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> & {
  children: ReactNode
  label?: string
  badgeLabel?: boolean
  description?: string | ReactNode
  info?: string
  errors?: string[] | null | undefined
  errorStyle?: 'inline' | 'tooltip'
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
}: FormFieldProps) {
  const error = errors?.[0]
  const id = useId()
  const formItemId = `${id}-form-item`
  const formDescriptionId = `${id}-form-item-description`
  const formMessageId = `${id}-form-item-message`
  const LabelComponent = badgeLabel ? BatchLabel : Label
  const input = (
    <div
      className={cn('space-y-2 w-full', className)}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
    >
      {label ? (
        info ? (
          <Tooltip
            asChild
            trigger={
              <div className='inline-block'>
                <div className='flex flex-row gap-1 items-center'>
                  <LabelComponent
                    variant={error ? 'destructive' : 'default'}
                    htmlFor={formItemId}
                  >
                    {label}
                  </LabelComponent>
                  <Icon name='info' />
                </div>
              </div>
            }
          >
            {info}
          </Tooltip>
        ) : (
          <div className='flex flex-row gap-1 items-center'>
            <LabelComponent
              variant={error ? 'destructive' : 'default'}
              htmlFor={formItemId}
            >
              {label}
            </LabelComponent>
          </div>
        )
      ) : null}
      <FormControl
        error={error}
        formItemId={formItemId}
        formDescriptionId={formDescriptionId}
        formMessageId={formMessageId}
      >
        {children}
      </FormControl>

      {description && (
        <FormDescription id={formDescriptionId}>{description}</FormDescription>
      )}

      {errorStyle === 'inline' ? (
        <InlineFormErrorMessage error={error} id={formMessageId} />
      ) : null}
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
