import { MouseEvent, useCallback, useMemo, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'
import { SerializedIssue } from '$/stores/issues'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { Button, type ButtonProps } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { buildIssuesCacheKey } from '@latitude-data/constants/issues'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { useIssueActions } from './useActions'
import { useOptimisticAction } from '$/hooks/useOptimisticActions'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { ResolveConfirmModal } from './ResolveConfirmModal'

type IssueAction = 'resolve' | 'unresolve' | 'ignore' | 'unignore'

const UNDO_TIMEOUT_MS = 10_000 // 10 seconds
const UNDO_MESSAGES = {
  resolve: {
    title: 'Issue resolved',
    description: 'The issue has been removed from the list',
  },
  unresolve: {
    title: 'Issue unresolved',
    description: 'The issue has been removed from the list',
  },
  ignore: {
    title: 'Issue ignored',
    description: 'The issue has been removed from the list',
  },
  unignore: {
    title: 'Issue unignored',
    description: 'The issue has been removed from the list',
  },
}

/**
 * The way this works is tha optimistic updates are performed immediately on the SWR cache,
 * and a toast with an "Undo" action is shown. If the user clicks "Undo", the cache is reverted.
 * If the timeout elapses without an undo, the backend call is made to perform the action.
 */
export function IssueItemActions({
  issue,
  placement,
  onOptimisticAction,
}: {
  issue: SerializedIssue
  placement: 'item' | 'details'
  onOptimisticAction?: () => void
}) {
  const { mutate } = useSWRConfig()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { urlParameters } = useIssuesParameters((state) => ({
    urlParameters: state.urlParameters,
  }))
  const actions = useIssueActions({ issue })
  const [showResolveModal, setShowResolveModal] = useState(false)

  // Fetch evaluations to check if any are associated with this issue
  const { data: evaluations = [] } = useEvaluationsV2({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: issue.documentUuid,
    },
  })

  // Filter evaluations associated with this issue
  const issueEvaluations = useMemo(
    () => evaluations.filter((e) => e.issueId === issue.id),
    [evaluations, issue.id],
  )
  const undoToast = useMemo(
    () => UNDO_MESSAGES[actions.action ?? 'resolve'],
    [actions.action],
  )
  const cacheKey = buildIssuesCacheKey({
    projectId: project.id,
    commitUuid: commit.uuid,
    searchParams: urlParameters || {},
  })
  const originalIssue = useRef<SerializedIssue | null>(null)
  const originalIndex = useRef<number>(-1)
  const { doOptimisticAction } = useOptimisticAction({
    undoTimeoutMs: UNDO_TIMEOUT_MS,
    undoToast,
    onOptimistic: useCallback(
      (action: IssueAction) => {
        originalIssue.current = issue

        mutate(
          cacheKey,
          (currentData: any) => {
            if (!currentData?.issues) return currentData

            originalIndex.current = currentData.issues.findIndex(
              (i: SerializedIssue) => i.id === issue.id,
            )
            if (originalIndex.current === -1) return currentData

            return {
              ...currentData,
              issues: currentData.issues.filter(
                (i: SerializedIssue) => i.id !== issue.id,
              ),
              totalCount: Math.max(0, currentData.totalCount - 1),
            }
          },
          { revalidate: false }, // Don't revalidate immediately
        )
        onOptimisticAction?.()

        actions.onAction({ action })
      },
      [issue, mutate, cacheKey, actions, onOptimisticAction],
    ),
    onUndo: useCallback(
      (action: IssueAction) => {
        if (!originalIssue.current) return

        mutate(
          cacheKey,
          (currentData: any) => {
            if (!currentData?.issues) return currentData

            const exists = currentData.issues.some(
              (i: SerializedIssue) => i.id === originalIssue.current!.id,
            )

            if (exists) return currentData

            const newIssues = [...currentData.issues]
            const insertIndex = Math.min(
              originalIndex.current,
              newIssues.length,
            )
            newIssues.splice(insertIndex, 0, originalIssue.current!)

            return {
              ...currentData,
              issues: newIssues,
              totalCount: currentData.totalCount + 1,
            }
          },
          { revalidate: false }, // Don't revalidate
        )
        actions.onReverseAction(action)
      },
      [mutate, cacheKey, actions],
    ),
  })

  const handleOptimisticUpdate = useCallback(
    (action: IssueAction) => {
      return (e: MouseEvent) => {
        e.stopPropagation()

        // For resolve action, check if we need to show the modal
        if (action === 'resolve') {
          if (issueEvaluations.length > 0) {
            setShowResolveModal(true)
            return
          }
          // No evaluations, proceed with ignoreEvaluations: false
          actions.setAction(action)
          actions.onAction({ action, ignoreEvals: false })

          // Perform optimistic update
          originalIssue.current = issue
          mutate(
            cacheKey,
            (currentData: any) => {
              if (!currentData?.issues) return currentData

              originalIndex.current = currentData.issues.findIndex(
                (i: SerializedIssue) => i.id === issue.id,
              )
              if (originalIndex.current === -1) return currentData

              return {
                ...currentData,
                issues: currentData.issues.filter(
                  (i: SerializedIssue) => i.id !== issue.id,
                ),
                totalCount: Math.max(0, currentData.totalCount - 1),
              }
            },
            { revalidate: false },
          )
          onOptimisticAction?.()
          return
        }

        actions.setAction(action)
        doOptimisticAction(action)
      }
    },
    [
      actions,
      doOptimisticAction,
      issueEvaluations,
      issue,
      mutate,
      cacheKey,
      onOptimisticAction,
    ],
  )

  const handleResolveConfirm = useCallback(
    (ignoreEvaluations: boolean) => {
      setShowResolveModal(false)
      actions.setAction('resolve')
      actions.onAction({ action: 'resolve', ignoreEvals: ignoreEvaluations })

      // Perform optimistic update
      originalIssue.current = issue
      mutate(
        cacheKey,
        (currentData: any) => {
          if (!currentData?.issues) return currentData

          originalIndex.current = currentData.issues.findIndex(
            (i: SerializedIssue) => i.id === issue.id,
          )
          if (originalIndex.current === -1) return currentData

          return {
            ...currentData,
            issues: currentData.issues.filter(
              (i: SerializedIssue) => i.id !== issue.id,
            ),
            totalCount: Math.max(0, currentData.totalCount - 1),
          }
        },
        { revalidate: false },
      )
      onOptimisticAction?.()
    },
    [actions, issue, mutate, cacheKey, onOptimisticAction],
  )

  const isResolved = issue.resolvedAt !== null
  const isIgnored = issue.ignoredAt !== null
  const isInactive = isResolved || isIgnored
  const buttonProps = useMemo<Partial<ButtonProps>>(() => {
    if (placement === 'details') {
      return { variant: 'outline', size: 'default' }
    }
    return { variant: 'ghost', size: 'icon' }
  }, [placement])

  if (isInactive) {
    return (
      <div className='flex gap-x-2'>
        <Tooltip
          asChild
          trigger={
            <Button
              {...buttonProps}
              onClick={handleOptimisticUpdate(
                isResolved ? 'unresolve' : 'unignore',
              )}
              disabled={actions.isRunningAction}
              iconProps={{ name: 'undo', color: 'foregroundMuted' }}
            >
              {placement === 'details'
                ? isResolved
                  ? 'Unresolve'
                  : 'Unignore'
                : ''}
            </Button>
          }
        >
          {isResolved
            ? 'Unresolve this issue'
            : 'Unignore this issue. Evaluations associated with this issue will start running again.'}
        </Tooltip>
      </div>
    )
  }

  return (
    <>
      <div className='min-w-14 flex gap-x-2'>
        <Tooltip
          asChild
          trigger={
            <Button
              {...buttonProps}
              onClick={handleOptimisticUpdate('resolve')}
              disabled={actions.isRunningAction}
              iconProps={{ name: 'checkClean', color: 'foregroundMuted' }}
            >
              {placement === 'details' ? 'Resolve' : ''}
            </Button>
          }
        >
          Resolve
        </Tooltip>
        <Tooltip
          asChild
          trigger={
            <Button
              {...buttonProps}
              onClick={handleOptimisticUpdate('ignore')}
              disabled={actions.isRunningAction}
              iconProps={{ name: 'eyeOff', color: 'foregroundMuted' }}
            >
              {placement === 'details' ? 'Ignore' : ''}
            </Button>
          }
        >
          Ignore, evaluations associated with this issue will stop running
        </Tooltip>
      </div>

      <ResolveConfirmModal
        open={showResolveModal}
        onOpenChange={setShowResolveModal}
        onConfirm={handleResolveConfirm}
        evaluations={issueEvaluations}
      />
    </>
  )
}
