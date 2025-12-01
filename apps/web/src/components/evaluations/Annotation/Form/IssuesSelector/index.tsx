import { useIssue } from '$/stores/issues/issue'
import { useSearchIssues } from '$/stores/issues/selectorIssues'
import { AnnotationContext, AnnotationFormWrapper } from '../../FormWrapper'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useToggleModal } from '$/hooks/useToogleModal'
import { NewIssueModal } from './NewIssueModal'
import { updateEvaluationResultInstance } from './updateEvaluationResultInstance'
import { use, useCallback, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ISSUE_GROUP } from '@latitude-data/constants/issues'

export function IssuesSelector() {
  const newIssueModal = useToggleModal()
  const { project } = useCurrentProject()
  const { span, evaluation, result, commit, documentUuid, mergedToIssueId } =
    use(AnnotationContext)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const isMergedIssue = Boolean(mergedToIssueId)
  const projectId = project.id
  const { mutate: mutateResults } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: span.documentUuid ?? '',
    },
    spanId: span.id,
    traceId: span.traceId,
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
      mutateResults((results) =>
        updateEvaluationResultInstance({
          prev: results,
          updatedResultWithEvaluation: {
            evaluation,
            result: evaluationResult,
          },
        }),
      )
    },
    onIssueUnAssigned: ({ data: evaluationResult }) => {
      mutateResults((results) =>
        updateEvaluationResultInstance({
          prev: results,
          updatedResultWithEvaluation: {
            evaluation,
            result: evaluationResult,
          },
        }),
      )
    },
  })

  const { data: searchIssues, isLoading: isSearchingIssues } = useSearchIssues({
    projectId,
    commitUuid: commit.uuid,
    documentUuid,
    query,
    group: ISSUE_GROUP.activeWithResolved,
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
    const list = searchIssues.map((issue) => ({
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
  }, [searchIssues, resultIssue])
  const onOpenChange = useCallback((open: boolean) => {
    setOpen(open)
    if (open) {
      setQuery('')
    }
  }, [])

  const onChange = useCallback(
    (issueId: number | undefined) => {
      if (!result) return
      if (!span.documentUuid) return

      // TODO(AO): Remember to unassign the issue if the user
      // updates the annotation from failed to passed!
      if (issueId === undefined) {
        unAssignIssue({
          projectId,
          documentUuid: span.documentUuid,
          commitUuid: commit.uuid,
          evaluationUuid: evaluation.uuid,
          evaluationResultUuid: result.uuid,
        })
      } else {
        assignIssue({
          projectId,
          documentUuid: span.documentUuid,
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
      span.documentUuid,
      evaluation.uuid,
      result,
    ],
  )
  const onClickCreate = useCallback(() => {
    setOpen(false)
    newIssueModal.onOpen()
  }, [newIssueModal])

  const hasReason = Boolean(
    result?.metadata && 'reason' in result.metadata && result.metadata.reason,
  )

  if (!result || result.hasPassed || !hasReason) return null

  const selectElement = (
    <Select<number>
      searchable
      removable={!isMergedIssue}
      width='auto'
      align='center'
      side='top'
      sideOffset={8}
      open={open}
      onOpenChange={onOpenChange}
      options={options}
      name='annotation-issue'
      loading={isLoading && !isSearchingIssues}
      disabled={(isLoading && !isSearchingIssues) || isMergedIssue}
      placeholder='Auto-discover issue'
      searchPlaceholder='Search existing issues...'
      placeholderIcon='sparkles'
      tooltip={
        isMergedIssue
          ? 'This span belongs to a merged issue. The assigned issue cannot be changed.'
          : 'Discovery could take a few minutes...'
      }
      onChange={onChange}
      onSearch={onSearch}
      value={resultIssue?.id}
      footerAction={{
        label: 'Create new issue',
        icon: 'plus',
        onClick: onClickCreate,
      }}
    />
  )

  return (
    <>
      <AnnotationFormWrapper.Body>
        {isMergedIssue ? (
          <Tooltip trigger={<div>{selectElement}</div>}>
            This span belongs to a merged issue. The assigned issue cannot be
            changed.
          </Tooltip>
        ) : (
          selectElement
        )}
      </AnnotationFormWrapper.Body>

      {newIssueModal.open ? (
        <NewIssueModal onClose={newIssueModal.onClose} />
      ) : null}
    </>
  )
}
