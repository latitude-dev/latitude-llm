import { useCallback, useMemo, useState } from 'react'
import { useSWRConfig } from 'swr'
import { ignoreIssueAction } from '$/actions/evaluationsV2/results/issues/ignoreIssue'
import { resolveIssueAction } from '$/actions/evaluationsV2/results/issues/resolveIssue'
import { unignoreIssueAction } from '$/actions/evaluationsV2/results/issues/unignoreIssue'
import { unresolveIssueAction } from '$/actions/evaluationsV2/results/issues/unresolveIssue'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { SerializedIssue } from '$/stores/issues'
import {
  buildIssuesCacheKey,
  ISSUE_STATUS,
} from '@latitude-data/constants/issues'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'

type IssueAction = 'resolve' | 'unresolve' | 'ignore' | 'unignore'

export function useIssueActions({ issue }: { issue: SerializedIssue }) {
  const [action, setAction] = useState<IssueAction | null>(null)
  const [ignoreEvaluations, setIgnoreEvaluations] = useState(false)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { mutate } = useSWRConfig()
  const { urlParameters } = useIssuesParameters((state) => ({
    urlParameters: state.urlParameters,
  }))

  const invalidateOppositeTab = useCallback(
    (targetStatus: 'active' | 'inactive') => {
      // Build cache key for the opposite tab with same filters/sorting but different status
      const oppositeParams = {
        ...urlParameters,
        status: targetStatus,
        page: undefined, // Reset to first page
      }

      const cacheKey = buildIssuesCacheKey({
        projectId: project.id,
        commitUuid: commit.uuid,
        searchParams: oppositeParams,
      })

      // Invalidate the cache for the opposite tab
      mutate(cacheKey)
    },
    [project.id, commit.uuid, urlParameters, mutate],
  )

  const onActivation = useCallback(() => {
    // When an issue becomes active (unresolve/unignore), invalidate the active tab cache
    invalidateOppositeTab(ISSUE_STATUS.active)
  }, [invalidateOppositeTab])

  const onDeactivation = useCallback(() => {
    // When an issue becomes inactive (resolve/ignore), invalidate the inactive tab cache
    invalidateOppositeTab(ISSUE_STATUS.inactive)
  }, [invalidateOppositeTab])
  const { execute: resolveIssue, isPending: isResolvingIssue } =
    useLatitudeAction(resolveIssueAction, { onSuccess: onDeactivation })

  const { execute: unresolveIssue, isPending: isUnresolvingIssue } =
    useLatitudeAction(unresolveIssueAction, { onSuccess: onActivation })

  const { execute: ignoreIssue, isPending: isIgnoringIssue } =
    useLatitudeAction(ignoreIssueAction, { onSuccess: onDeactivation })

  const { execute: unignoreIssue, isPending: isUnignoringIssue } =
    useLatitudeAction(unignoreIssueAction, { onSuccess: onActivation })

  const isRunningAction =
    isResolvingIssue ||
    isUnresolvingIssue ||
    isIgnoringIssue ||
    isUnignoringIssue

  const onAction = useCallback(
    ({
      action,
      ignoreEvals,
    }: {
      action: IssueAction
      ignoreEvals?: boolean
    }) => {
      const actionParams = {
        projectId: project.id,
        commitUuid: commit.uuid,
        issueId: issue.id,
      }
      if (action === 'resolve') {
        resolveIssue({
          ...actionParams,
          ignoreEvaluations: ignoreEvals ?? ignoreEvaluations,
        })
      } else if (action === 'unresolve') {
        unresolveIssue(actionParams)
      } else if (action === 'ignore') {
        ignoreIssue(actionParams)
      } else if (action === 'unignore') {
        unignoreIssue(actionParams)
      }
    },
    [
      resolveIssue,
      unresolveIssue,
      ignoreIssue,
      unignoreIssue,
      project.id,
      commit.uuid,
      issue.id,
      ignoreEvaluations,
    ],
  )

  const onReverseAction = useCallback(
    (optimistic: IssueAction) => {
      const actionParams = {
        projectId: project.id,
        commitUuid: commit.uuid,
        issueId: issue.id,
      }
      if (optimistic === 'resolve') {
        unresolveIssue(actionParams)
      } else if (optimistic === 'unresolve') {
        resolveIssue({ ...actionParams, ignoreEvaluations: false })
      } else if (optimistic === 'ignore') {
        unignoreIssue(actionParams)
      } else if (optimistic === 'unignore') {
        ignoreIssue(actionParams)
      }
    },
    [
      resolveIssue,
      unresolveIssue,
      ignoreIssue,
      unignoreIssue,
      project.id,
      commit.uuid,
      issue.id,
    ],
  )

  return useMemo(
    () => ({
      action,
      setAction,
      ignoreEvaluations,
      setIgnoreEvaluations,
      onAction,
      onReverseAction,
      isRunningAction,
    }),
    [
      onAction,
      isRunningAction,
      action,
      setAction,
      ignoreEvaluations,
      setIgnoreEvaluations,
      onReverseAction,
    ],
  )
}
