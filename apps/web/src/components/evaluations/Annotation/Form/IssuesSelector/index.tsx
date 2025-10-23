import { use, useCallback, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { useIssue } from '$/stores/issues/issue'
import { useSearchIssues } from '$/stores/issues/selectorIssues'
import { AnnotationContext, AnnotationFormWrapper } from '../../FormWrapper'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useFeature from '$/stores/useFeature'
import { useToggleModal } from '$/hooks/useToogleModal'
import { updateEvaluationResultInstance } from './updateEvaluationResultInstance'
import { NewIssueModal } from './NewIssueModal'

export function IssuesSelector() {
  const issuesFeature = useFeature('issues')
  const newIssueModal = useToggleModal()
  const { project } = useCurrentProject()
  const { documentLog, evaluation, result, commit, documentUuid } =
    use(AnnotationContext)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const projectId = project.id
  const { mutate: mutateResults } = useEvaluationResultsV2ByDocumentLogs({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: documentLog.documentUuid,
    },
    documentLogUuids: [documentLog.uuid],
  })
  const {
    data: resultIssue,
    assignIssue,
    unAssignIssue,
    isAssigningIssue,
    isUnAssigningIssue,
    isLoading: isLoadingIssue,
  } = useIssue({
    projectId,
    commitUuid: commit.uuid,
    issueId: result?.issueId,
    onIssueAssigned: ({ data: { evaluationResult } }) => {
      mutateResults((results) => {
        return updateEvaluationResultInstance({
          prev: results,
          documentLogUuid: documentLog.uuid,
          updatedResultWithEvaluation: {
            evaluation,
            result: evaluationResult,
          },
        })
      })
    },
    onIssueUnAssigned: ({ data: evaluationResult }) => {
      mutateResults((results) => {
        return updateEvaluationResultInstance({
          prev: results,
          documentLogUuid: documentLog.uuid,
          updatedResultWithEvaluation: {
            evaluation,
            result: evaluationResult,
          },
        })
      })
    },
  })

  const { data: serachIssues, isLoading: isSearchingIssues } = useSearchIssues({
    projectId,
    commitUuid: commit.uuid,
    documentUuid,
    query,
  })
  const isLoading =
    isLoadingIssue ||
    isSearchingIssues ||
    isAssigningIssue ||
    isUnAssigningIssue
  const onSearch = useDebouncedCallback(async (value: string) => {
    setQuery(value)
  }, 500)
  const options = useMemo<SelectOption<number>[]>(() => {
    const list = serachIssues.map((issue) => ({
      label: issue.title,
      value: issue.id,
    }))

    // Put in the list evaluation result assigned issue if not present
    if (resultIssue) {
      const exists = list.find((item) => item.value === resultIssue.id)

      if (!exists) {
        list.unshift({
          label: resultIssue.title,
          value: resultIssue.id,
        })
      }
    }

    return list
  }, [serachIssues, resultIssue])
  const onOpenChange = useCallback((open: boolean) => {
    setOpen(open)
    if (open) {
      setQuery('')
    }
  }, [])

  const onChange = useCallback(
    (issueId: number | undefined) => {
      if (!result) return

      if (issueId === undefined) {
        unAssignIssue({
          projectId,
          documentUuid: documentLog.documentUuid,
          commitUuid: commit.uuid,
          evaluationUuid: evaluation.uuid,
          evaluationResultUuid: result.uuid,
        })
      } else {
        assignIssue({
          projectId,
          documentUuid: documentLog.documentUuid,
          commitUuid: commit.uuid,
          evaluationUuid: evaluation.uuid,
          evaluationResultUuid: result.uuid,
          issueId,
        })
      }
    },
    [
      assignIssue,
      unAssignIssue,
      projectId,
      commit.uuid,
      documentLog.documentUuid,
      evaluation.uuid,
      result,
    ],
  )
  const onClickCreate = useCallback(() => {
    setOpen(false)
    newIssueModal.onOpen()
  }, [newIssueModal])

  if (!issuesFeature.isEnabled) return null

  const hasReason = Boolean(
    result?.metadata && 'reason' in result.metadata && result.metadata.reason,
  )

  if (!result || result.hasPassed || !hasReason) return null

  return (
    <>
      <AnnotationFormWrapper.Body>
        <Select<number>
          searchable
          removable
          width='auto'
          open={open}
          onOpenChange={onOpenChange}
          options={options}
          name='annotation-issue'
          disabled={isLoading}
          placeholder='Auto-discover issue'
          searchPlaceholder='Search existing issues...'
          placeholderIcon='sparkles'
          onChange={onChange}
          onSearch={onSearch}
          value={resultIssue?.id}
          footerAction={{
            label: 'Create New Issue',
            icon: 'plus',
            onClick: onClickCreate,
          }}
        />
      </AnnotationFormWrapper.Body>

      {newIssueModal.open ? (
        <NewIssueModal onClose={newIssueModal.onClose} />
      ) : null}
    </>
  )
}
