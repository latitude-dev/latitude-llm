import { CalendarProps, useCalendar } from '@react-aria/calendar'
import { DateValue } from '@react-aria/datepicker'
import { useLocale } from '@react-aria/i18n'
import { useCalendarState } from '@react-stately/calendar'
import { Calendar as ICalendar } from '@internationalized/date'

import { createCalendar } from '../InputDate'
import CalendarMonth from './Month'
import { useFocusedValue } from './useFocusedValue'
import CalendarHeader from './Header'

type Props<T extends DateValue> = CalendarProps<T> & {
  maxWidth?: number
  createCalendar?: (calendarType: string) => ICalendar
}
export function Calendar<T extends DateValue>(props: Props<T>) {
  const { value, maxWidth } = props
  const { locale } = useLocale()
  const { focusedValue, captureOnPressPrev, captureOnPressNext } =
    useFocusedValue({ value })
  const state = useCalendarState({
    ...props,
    value,
    focusedValue,
    visibleDuration: { months: 1 },
    locale,
    createCalendar: props.createCalendar ?? createCalendar,
  })
  const currentMonth = state.visibleRange.start
  const {
    calendarProps,
    prevButtonProps: prev,
    nextButtonProps: next,
  } = useCalendar(props, state)
  const prevButtonProps = captureOnPressPrev(prev)
  const nextButtonProps = captureOnPressNext(next)
  return (
    <div {...calendarProps}>
      <CalendarHeader
        months={[currentMonth]}
        timeZone={state.timeZone}
        prevButtonProps={prevButtonProps}
        nextButtonProps={nextButtonProps}
      />
      <div className='flex justify-center'>
        <div className='w-full' style={{ maxWidth }}>
          <CalendarMonth {...props} state={state} currentMonth={currentMonth} />
        </div>
      </div>
    </div>
  )
}
