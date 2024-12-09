import { useRef } from 'react'
import {
  isSameDay,
  isSameMonth,
  getDayOfWeek,
  CalendarDate,
} from '@internationalized/date'
import { mergeProps } from '@react-aria/utils'
import { useCalendarCell } from '@react-aria/calendar'
import { useFocusRing } from '@react-aria/focus'
import { CalendarState, RangeCalendarState } from '@react-stately/calendar'
import { useLocale } from '@react-aria/i18n'
import { cn } from '../../../../../lib/utils'

import { TextColor } from '../../../../tokens/colors'
import Text from '../../../Text'

type Props = {
  state: RangeCalendarState | CalendarState
  currentMonth: CalendarDate
  date: CalendarDate
}

export default function CalendarDay({ state, currentMonth, date }: Props) {
  const ref = useRef()
  const { locale } = useLocale()
  const { cellProps, buttonProps, isSelected, isDisabled, formattedDate } =
    useCalendarCell({ date }, state, ref)

  const isOutsideMonth = !isSameMonth(currentMonth, date)
  // The start and end date of the selected range will have
  // an emphasized appearance.
  const start = (state as RangeCalendarState).highlightedRange?.start
  const isSelectionStart = (state as RangeCalendarState).highlightedRange
    ? start
      ? isSameDay(date, start)
      : false
    : isSelected

  const end = (state as RangeCalendarState).highlightedRange?.end
  const isSelectionEnd = (state as RangeCalendarState).highlightedRange
    ? end
      ? isSameDay(date, end)
      : false
    : isSelected

  // We add rounded corners on the left for the first day of the month,
  // the first day of each week, and the start date of the selection.
  // We add rounded corners on the right for the last day of the month,
  // the last day of each week, and the end date of the selection.
  const dayOfWeek = getDayOfWeek(date, locale)
  const isRoundedLeft =
    isSelected && (isSelectionStart || dayOfWeek === 0 || date.day === 1)
  const isRoundedRight =
    isSelected &&
    (isSelectionEnd ||
      dayOfWeek === 6 ||
      date.day === date.calendar.getDaysInMonth(date))

  const { focusProps, isFocusVisible } = useFocusRing()
  const isSelectionBoundary = isSelectionStart || isSelectionEnd
  const isInsideSelection = isSelected && !isSelectionBoundary
  const isNotSelected = !isSelected && !isDisabled

  let textColor: TextColor = 'foregroundMuted'
  if (isSelectionBoundary) {
    textColor = 'white'
  } else if (isInsideSelection) {
    textColor = 'primary'
  }

  return (
    <div
      {...cellProps}
      className={cn('w-8 h-8 relative select-none', {
        'z-10': isFocusVisible,
        'z-0': !isFocusVisible,
      })}
    >
      <div
        {...mergeProps(buttonProps, focusProps)}
        ref={ref}
        hidden={isOutsideMonth}
        className={cn('w-full h-full outline-none group', {
          'rounded-l-lg': isRoundedLeft,
          'rounded-r-lg': isRoundedRight,
          'bg-primary-50': isSelected,
          disabled: isDisabled,
        })}
      >
        <div
          className={cn(
            'w-full h-full flex items-center justify-center cursor-default',
            {
              'ring-2 group-focus:z-2 ring-primary-300 ring-offset-2':
                isFocusVisible,
              'bg-primary-500 text-white': isSelectionBoundary,
              'rounded-l-lg': isRoundedLeft,
              'rounded-r-lg': isRoundedRight,
              'bg-primary-50': isInsideSelection,
              'rounded-lg': !isSelected,
              'hover:bg-primary-50': isNotSelected,
            },
          )}
        >
          <Text.H5M color={textColor}>{formattedDate}</Text.H5M>
        </div>
      </div>
    </div>
  )
}
