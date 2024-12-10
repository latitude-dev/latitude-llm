import { useRef, KeyboardEvent } from 'react'
import { DateValue, useDateField, useDateSegment } from '@react-aria/datepicker'
import { useLocale } from '@react-aria/i18n'
import {
  DateFieldState,
  DateFieldStateOptions,
  DateSegment,
  useDateFieldState,
} from '@react-stately/datepicker'
import { GregorianCalendar, Calendar } from '@internationalized/date'
import { InputProps, InputVariants, useInputStyles } from '../Input'
import { colors } from '../../tokens/colors'

import { cn } from '../../../lib/utils'
import { FormField, FormFieldProps } from '../FormField'
import { safeParseDate } from '../DatePicker/utils'
import { Icon } from '../Icons'

// Load only atm Gregorian calendar to reduce bundle size
// https://react-spectrum.adobe.com/react-aria/useDateField.html#reducing-bundle-size
export function createCalendar(identifier = 'gregory') {
  switch (identifier) {
    case 'gregory':
      return new GregorianCalendar()
    default:
      throw new Error(`Unsupported calendar ${identifier}`)
  }
}

type SegmentProps = {
  segment: DateSegment
  state: DateFieldState
  onSegmentEnter: () => void | undefined
}
function DateSegmentItem({ segment, state, onSegmentEnter }: SegmentProps) {
  const ref = useRef(null)
  const { segmentProps: seg } = useDateSegment(segment, state, ref)

  const isSeparator = segment.type === 'literal'
  const isDatePart = !isSeparator
  const isPlaceholder = segment.isPlaceholder
  const segmentProps = {
    ...seg,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' && onSegmentEnter) {
        onSegmentEnter()
      } else {
        seg.onKeyDown?.(event)
      }
    },
  }
  return (
    <div
      {...segmentProps}
      ref={ref}
      className={cn('focus-visible:text-primary-500 focus-visible:outline-0', {
        [colors.textColors.foregroundMuted]: isPlaceholder || isSeparator,
        [colors.textColors.foreground]: !isPlaceholder && isDatePart,
      })}
    >
      {segment.text}
    </div>
  )
}

export type DateInputProps = Omit<
  DateFieldStateOptions<DateValue>,
  'createCalendar'
> &
  InputVariants &
  Omit<FormFieldProps, 'children'> & {
    hideNativeAppearance?: boolean
    name: string
    onChangeValue?: (value: string) => void
    createCalendar?: (calendarType: string) => Calendar
    onSelectClose?: boolean
    disabled?: boolean
    inputSize?: InputProps['size']
    maxGranularity?: 'year' | 'month'
    onEnter?: () => void
    isOpen?: boolean
    standalone?: boolean
  }

export function InputDate({
  disabled,
  inputSize,
  onChangeValue,
  onEnter,
  errors,
  className,
  hideNativeAppearance,
  errorStyle,
  label,
  info,
  description,
  isOpen,
  standalone = false,
  ...rest
}: DateInputProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { locale } = useLocale()
  const props = {
    ...rest,
    isDisabled: disabled,
    onChange: (date: DateValue) => {
      rest?.onChange?.(date)

      const changed = safeParseDate(date)

      if (!changed) return

      onChangeValue?.(changed)
    },
  }

  const styles = useInputStyles({
    errors: errors,
    size: inputSize,
    hidden: rest.hidden,
    className,
    hideNativeAppearance,
    forceFocusVisible: isOpen,
  })
  const state = useDateFieldState({
    locale,
    createCalendar: props.createCalendar ?? createCalendar,
  })
  const { fieldProps } = useDateField(
    {
      ...props,
      'aria-label': rest.name,
    },
    state,
    ref,
  )

  return (
    <FormField
      label={label}
      info={info}
      description={description}
      errors={errors}
      errorStyle={errorStyle}
    >
      <div className={cn(styles, 'flex flex-row items-center gap-x-2')}>
        <div
          ref={ref}
          {...fieldProps}
          className='w-full focus:z-10 focus-within:z-10 focus-visible:outline-0'
        >
          <ul className='flex space-x-0.5 overflow-hidden'>
            {state.segments.map((segment, i) => (
              <li key={i}>
                <DateSegmentItem
                  segment={segment}
                  state={state}
                  onSegmentEnter={() => onEnter?.()}
                />
              </li>
            ))}
          </ul>
        </div>
        {!standalone ? (
          <Icon
            name='calendar'
            size='normal'
            color={isOpen ? 'primary dark:foreground' : 'foregroundMuted'}
            className='cursor-pointer flex-none'
          />
        ) : null}
      </div>
    </FormField>
  )
}
