import { useCallback } from 'react'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'
import { RadioToggleInput } from '@latitude-data/web-ui/molecules/RadioToggleInput'
import {
  SafeIssuesParams,
  ISSUE_STATUS,
  IssueStatus,
} from '@latitude-data/constants/issues'
import { useSeenAtDatePicker } from './useSeenAtDatePicker'

const STATUS_OPTIONS = [
  { label: 'Active', value: ISSUE_STATUS.active },
  { label: 'Inactive', value: ISSUE_STATUS.inactive },
]
export function IssuesFilters({
  serverParams,
}: {
  serverParams: SafeIssuesParams
}) {
  const { filters, setFilters } = useIssuesParameters((state) => ({
    filters: state.filters,
    setFilters: state.setFilters,
  }))
  const { dateWindow, onDateWindowChange } = useSeenAtDatePicker({
    serverParams,
  })
  const onStatusChange = useCallback(
    (status: IssueStatus) => {
      setFilters({ status })
    },
    [setFilters],
  )

  return (
    <>
      <RadioToggleInput
        name='issue-status'
        options={STATUS_OPTIONS}
        value={
          filters.status ?? serverParams.filters.status ?? ISSUE_STATUS.active
        }
        onChange={onStatusChange}
      />
      <DatePickerRange
        showPresets
        align='end'
        singleDatePrefix='Up to'
        placeholder='Filter by date'
        initialRange={dateWindow}
        onCloseChange={onDateWindowChange}
      />
    </>
  )
}
