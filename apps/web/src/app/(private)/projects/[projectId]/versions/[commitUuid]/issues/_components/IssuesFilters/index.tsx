import { useCallback } from 'react'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { DatePickerRange } from '@latitude-data/web-ui/atoms/DatePicker'
import { RadioToggleInput } from '@latitude-data/web-ui/molecules/RadioToggleInput'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import {
  SafeIssuesParams,
  ISSUE_STATUS,
  IssueStatus,
} from '@latitude-data/constants/issues'
import { useDocuments } from './useDocuments'
import { useSeenAtDatePicker } from './useSeenAtDatePicker'

const STATUS_OPTIONS = [
  { label: 'Active', value: ISSUE_STATUS.active },
  { label: 'Regressed', value: ISSUE_STATUS.regressed },
  { label: 'Archived', value: ISSUE_STATUS.archived },
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
  const { documentOptions, isLoading: isLoadingDocuments } = useDocuments()

  const onStatusChange = useCallback(
    (status: IssueStatus) => {
      setFilters({ status })
    },
    [setFilters],
  )

  const onDocumentChange = useCallback(
    (documentUuid?: string | null) => {
      setFilters({ documentUuid })
    },
    [setFilters],
  )

  return (
    <>
      <div className='flex'>
        <Select<string | null | undefined>
          removable
          searchable
          loading={isLoadingDocuments}
          width='full'
          align='end'
          name='document-filter'
          placeholder='Select document'
          options={documentOptions}
          value={filters.documentUuid ?? serverParams.filters.documentUuid}
          onChange={onDocumentChange}
        />
      </div>
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
