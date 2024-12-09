import { useEffect, useRef } from 'react'

import { AriaButtonProps } from '@react-aria/button'
import { PressEvent } from '@react-types/shared'
import { DateValue } from '@react-aria/datepicker'

/**
 * This hook is important if you're using this calendar
 * with a controlled input that can move selected date at any year, month or day
 * in time.
 *
 * When this happens we react to `value` changed with `useEffect` and set `focusedValue`
 * that we pass to `import { useCalendarState } from '@react-stately/calendar'`
 * This way calendar moves when user types in the input
 *
 * This is perfect but `useCalendarState` when clicking on `prev` and `next`
 * buttons is checking that `focusedValue` is present in the month the user is going
 * to click. For doing that we hijack `onPress` key and set `focusedValue` on the
 * expect month
 */
type Props<T extends DateValue> = { value: T | undefined | null }
export function useFocusedValue<T extends DateValue>({ value }: Props<T>) {
  const focusedValue = useRef(value)

  // Each time value change update `focusedValue`
  useEffect(() => {
    focusedValue.current = value
  }, [value, focusedValue])

  return {
    focusedValue: focusedValue.current,
    captureOnPressPrev: (props: AriaButtonProps<'button'>) => {
      return {
        ...props,
        onPress: (e: PressEvent) => {
          const value = focusedValue.current

          if (!value) return props.onPress?.(e)

          // Before pressing prev button in calendar
          // we need to make sure focus value is already in that month
          focusedValue.current = value.subtract({
            months: 1,
          }) as T

          props.onPress?.(e)
        },
      }
    },
    captureOnPressNext: (props: AriaButtonProps<'button'>) => {
      return {
        ...props,
        onPress: (e: PressEvent) => {
          const value = focusedValue.current

          if (!value) return props.onPress?.(e)

          // Before pressing next button in calendar
          // we need to make sure focus value is already in that month
          focusedValue.current = value.add({
            months: 1,
          }) as T

          props.onPress?.(e)
        },
      }
    },
  }
}
