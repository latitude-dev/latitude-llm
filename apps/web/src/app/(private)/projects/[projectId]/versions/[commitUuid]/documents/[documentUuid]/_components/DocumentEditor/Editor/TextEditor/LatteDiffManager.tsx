import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useMemo } from 'react'
import { useLatteChangeActions } from '$/hooks/latte/useLatteChangeActions'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useLatteStore } from '$/stores/latte/index'
import { useDevMode } from '$/hooks/useDevMode'
import { useLatteDiff } from '$/hooks/useLatteDiff'
import { ROUTES } from '$/services/routes'
import { useNavigate } from '$/hooks/useNavigate'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import useLatteThreadCheckpoints from '$/stores/latteThreadCheckpoints'

export function LatteDiffManager() {
  const { acceptPartialChanges, undoPartialChanges: discardPartialChanges } =
    useLatteChangeActions()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const { isBrewing, threadUuid } = useLatteStore()
  const { updateDocumentContent } = useDocumentValue()
  const { devMode } = useDevMode()
  const { diff } = useLatteDiff()
  const navigate = useNavigate()
  const { data: checkpoints } = useLatteThreadCheckpoints({
    threadUuid,
    commitId: commit.id,
    refreshInterval: isBrewing ? 2000 : 0, // Poll every 2 seconds when brewing
  })

  const currentCheckpointIndex = useMemo(() => {
    if (!checkpoints.length) return -1
    return checkpoints.findIndex(
      (cp) => cp.documentUuid === document.documentUuid,
    )
  }, [checkpoints, document.documentUuid])

  const handleNavigateToCheckpoint = useCallback(
    (direction: 'prev' | 'next') => {
      if (!checkpoints.length) return
      const newIndex =
        currentCheckpointIndex === -1
          ? direction === 'prev'
            ? checkpoints.length - 1
            : 0
          : direction === 'prev'
            ? Math.max(0, currentCheckpointIndex - 1)
            : Math.min(checkpoints.length - 1, currentCheckpointIndex + 1)
      if (newIndex !== currentCheckpointIndex) {
        const targetCheckpoint = checkpoints[newIndex]
        navigate.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: targetCheckpoint.documentUuid }).root,
        )
      }
    },
    [checkpoints, currentCheckpointIndex, navigate, project.id, commit.uuid],
  )

  const handlePartialRejectChange = useCallback(async () => {
    discardPartialChanges({
      documentUuids: [document.documentUuid],
    })

    if (!diff?.oldValue) {
      // Optimistically redirect if document is deleted
      navigate.push(
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid }).documents.root,
      )
    } else {
      // Optimistically update the document value to the previous value
      updateDocumentContent?.(diff?.oldValue, { origin: 'latteCopilot' })
    }
  }, [
    discardPartialChanges,
    document.documentUuid,
    commit.uuid,
    navigate,
    project.id,
    updateDocumentContent,
    diff,
  ])

  const handlePartialAcceptChange = useCallback(() => {
    acceptPartialChanges({
      documentUuids: [document.documentUuid],
    })

    if (diff?.newValue) {
      updateDocumentContent?.(diff?.newValue, { origin: 'latteCopilot' })
    }
  }, [
    acceptPartialChanges,
    document.documentUuid,
    diff?.newValue,
    updateDocumentContent,
  ])

  const handleReviewNextFile = useCallback(() => {
    handleNavigateToCheckpoint('next')
  }, [handleNavigateToCheckpoint])

  if (!devMode) return null
  if (!checkpoints.length) return null

  return (
    <div className='border flex flex-row gap-4 items-center bg-background rounded-xl p-1'>
      {diff && checkpoints.length > 1 && (
        <div className='flex flex-1 flex-noShrink flex-row gap-1 items-center'>
          <Button
            size='small'
            variant='ghost'
            onClick={() => handleNavigateToCheckpoint('prev')}
            disabled={
              isBrewing ||
              (currentCheckpointIndex !== -1
                ? currentCheckpointIndex <= 0
                : false)
            }
            iconProps={{ name: 'chevronLeft' }}
          />
          <Text.H6M color='foregroundMuted' noWrap>
            {currentCheckpointIndex === -1 ? '—' : currentCheckpointIndex + 1} /{' '}
            {checkpoints.length}
          </Text.H6M>
          <Button
            size='small'
            variant='ghost'
            onClick={() => handleNavigateToCheckpoint('next')}
            disabled={
              isBrewing ||
              (currentCheckpointIndex !== -1
                ? currentCheckpointIndex >= checkpoints.length - 1
                : false)
            }
            iconProps={{ name: 'chevronRight' }}
          />
        </div>
      )}
      {!diff && checkpoints.length > 0 ? (
        <div className='flex-shrink-0'>
          <Button
            size='small'
            variant='primaryMuted'
            onClick={handleReviewNextFile}
            iconProps={{ name: 'arrowRight' }}
            disabled={isBrewing}
            className='flex-shrink-0'
          >
            Review next file
          </Button>
        </div>
      ) : diff ? (
        <div className='flex flex-row gap-2 items-center'>
          <Button
            size='small'
            variant='ghost'
            onClick={handlePartialRejectChange}
            disabled={isBrewing || !diff}
            iconProps={{
              name: 'undo',
            }}
          >
            Undo
          </Button>
          <Button
            size='small'
            variant='primaryMuted'
            onClick={handlePartialAcceptChange}
            iconProps={{ name: 'check' }}
            disabled={isBrewing || !diff}
          >
            Keep
          </Button>
        </div>
      ) : null}
    </div>
  )
}
