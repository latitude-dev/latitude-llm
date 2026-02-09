import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useIssue } from '$/stores/issues/issue'
import { useSearchIssues } from '$/stores/issues/selectorIssues'
import { ISSUE_GROUP } from '@latitude-data/core/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

export function LinkedIssueSelect({
  issueId,
  setIssueId,
  errors,
  disabled,
}: {
  issueId?: number | null
  setIssueId?: (issueId: number | null) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [query, setQuery] = useState('')
  const onSearch = useDebouncedCallback((value: string) => {
    setQuery(value)
  }, 500)

  const { data: selectedIssue, isLoading: isLoadingSelectedIssue } = useIssue({
    projectId: project.id,
    commitUuid: commit.uuid,
    issueId,
  })

  const { data: issues, isLoading: isLoadingIssues } = useSearchIssues({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    query,
    group: ISSUE_GROUP.active,
  })

  const issueOptions = useMemo(() => {
    const list = issues.map((issue) => ({
      label: issue.title,
      hoverDescription: issue.description,
      value: issue.id,
    }))

    if (selectedIssue) {
      const exists = list.find((item) => item.value === selectedIssue.id)
      if (!exists) {
        list.unshift({
          label: selectedIssue.title,
          hoverDescription: selectedIssue.description,
          value: selectedIssue.id,
        })
      }
    }
    return list
  }, [issues, selectedIssue])

  return (
    <FormFieldGroup
      label='Linked issue'
      description='Track and monitor an issue using failing results from this evaluation'
      layout='horizontal'
    >
      <Select
        searchable
        removable
        value={selectedIssue?.id}
        name='issueId'
        placeholder='Select an issue'
        searchPlaceholder='Search issues...'
        loading={isLoadingSelectedIssue}
        searchLoading={isLoadingIssues}
        disabled={disabled || isLoadingSelectedIssue}
        options={issueOptions}
        onSearch={onSearch}
        onChange={(value) => setIssueId?.(value ?? null)}
        errors={errors?.['issueId']}
      />
    </FormFieldGroup>
  )
}
