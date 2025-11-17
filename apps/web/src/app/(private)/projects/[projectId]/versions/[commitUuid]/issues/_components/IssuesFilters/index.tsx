import { useCallback } from 'react'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'
import { RadioToggleInput } from '@latitude-data/web-ui/molecules/RadioToggleInput'
import {
  SafeIssuesParams,
  ISSUE_GROUP,
  IssueGroup,
} from '@latitude-data/constants/issues'
import { useSeenAtDatePicker } from './useSeenAtDatePicker'

const STATUS_OPTIONS = [
  { label: 'Active', value: ISSUE_GROUP.active },
  { label: 'Inactive', value: ISSUE_GROUP.inactive },
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
    (status: IssueGroup) => {
      setFilters({ group: status })
    },
    [setFilters],
  )

  return (
    <>
      <RadioToggleInput
        name='issue-status'
        options={STATUS_OPTIONS}
        value={
          filters.group ?? serverParams.filters.group ?? ISSUE_GROUP.active
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
