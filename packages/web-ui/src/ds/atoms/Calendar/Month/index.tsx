import { getWeeksInMonth, CalendarDate } from '@internationalized/date'
import { useLocale } from '@react-aria/i18n'
import { CalendarState, RangeCalendarState } from '@react-stately/calendar'

import Text from '../../Text'
import Day from './Day'
import { useCalendarGrid } from './useCalendarGrid'

type Props = {
  state: RangeCalendarState | CalendarState
  currentMonth: CalendarDate
}

export default function CalendarMonth(props: Props) {
  const { state, currentMonth } = props
  const { locale } = useLocale()
  const { gridProps, headerProps, weekDays } = useCalendarGrid({
    timeZone: state.timeZone,
    setFocused: state.setFocused,
  })
  const weeksInMonth = getWeeksInMonth(currentMonth, locale)
  return (
    <div {...gridProps} className='flex flex-col gap-3'>
      <div {...headerProps} className='grid grid-cols-7'>
        {weekDays.map((day: string, index: number) => (
          <div key={index} className='text-center select-none'>
            <Text.H7C color='foregroundMuted'>{day}</Text.H7C>
          </div>
        ))}
      </div>
      <div className='grid grid-cols-7 gap-1'>
        {[...new Array(weeksInMonth).keys()].flatMap((weekIndex) =>
          state
            .getDatesInWeek(weekIndex, currentMonth)
            .map((date: CalendarDate | null, i: number) =>
              date ? (
                <Day
                  key={`${weekIndex}-${i}`}
                  state={state}
                  date={date}
                  currentMonth={currentMonth}
                />
              ) : (
                <div key={`${weekIndex}-${i}`} />
              ),
            ),
        )}
      </div>
    </div>
  )
}
