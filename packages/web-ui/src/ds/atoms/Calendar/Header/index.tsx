import { useRef } from 'react'
import { useDateFormatter } from '@react-aria/i18n'
import { AriaButtonProps, useButton } from '@react-aria/button'
import { CalendarDate, DateFormatter } from '@internationalized/date'

import Text from '../../Text'

import { useFocusRing } from '@react-aria/focus'
import { mergeProps } from '@react-aria/utils'

import { Button } from '../../../atoms/Button'

type ButtonProps = AriaButtonProps & { direction: 'left' | 'right' }
export function ActionButton(props: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const { buttonProps } = useButton(props, ref)
  const { focusProps } = useFocusRing()
  return (
    <Button
      size='small'
      variant='nope'
      className='focus-visible:outline-0'
      iconProps={{
        name: props.direction === 'left' ? 'chevronLeft' : 'chevronRight',
      }}
      {...mergeProps(buttonProps, focusProps)}
    />
  )
}
// This returns a Calendar era
// https://en.wikipedia.org/wiki/Calendar_era
function findEra(date: CalendarDate): 'long' | 'short' | 'narrow' | undefined {
  return date.calendar.identifier === 'gregory' && date.era === 'BC'
    ? 'short'
    : undefined
}
type MonthTitleProps = {
  dateFormatter: DateFormatter
  month: CalendarDate
  timeZone: string
}
const MonthTitle = ({ dateFormatter, timeZone, month }: MonthTitleProps) => (
  <div className='flex-1 text-center select-none'>
    <Text.H5M color='foregroundMuted'>
      {dateFormatter.format(month.toDate(timeZone))}
    </Text.H5M>
  </div>
)

type Props = {
  months: CalendarDate[]
  timeZone: string
  prevButtonProps: AriaButtonProps<'button'>
  nextButtonProps: AriaButtonProps<'button'>
}
export default function CalendarHeader({
  timeZone,
  months,
  prevButtonProps,
  nextButtonProps,
}: Props) {
  const first = months[0]
  const dateFormatter = useDateFormatter({
    month: 'long',
    year: 'numeric',
    era: first ? findEra(first) : undefined,
    calendar: first?.calendar?.identifier,
    timeZone,
  })

  return (
    <div className='flex items-center mb-4'>
      <ActionButton {...prevButtonProps} direction='left' />
      {months.map((month, index) => (
        <MonthTitle
          key={index}
          dateFormatter={dateFormatter}
          timeZone={timeZone}
          month={month}
        />
      ))}
      <ActionButton {...nextButtonProps} direction='right' />
    </div>
  )
}
