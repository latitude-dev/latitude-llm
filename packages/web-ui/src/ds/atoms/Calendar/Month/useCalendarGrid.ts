import { useMemo } from 'react'
import { CalendarGridAria } from '@react-aria/calendar'
import { startOfWeek, today } from '@internationalized/date'
import { useDateFormatter, useLocale } from '@react-aria/i18n'

type Props = {
  timeZone: string
  setFocused: (value: boolean) => void
}
export function useCalendarGrid({
  timeZone,
  setFocused,
}: Props): CalendarGridAria {
  const { locale } = useLocale()
  const dayFormatter = useDateFormatter({
    weekday: 'short',
    timeZone: timeZone,
  })
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(today(timeZone), locale)

    return [...new Array(7).keys()].map((index) => {
      const date = weekStart.add({ days: index })
      const dateDay = date.toDate(timeZone)

      return dayFormatter.format(dateDay)
    })
  }, [locale, timeZone, dayFormatter])

  return {
    gridProps: {
      role: 'grid',
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
    headerProps: {},
    weekDays,
  }
}
