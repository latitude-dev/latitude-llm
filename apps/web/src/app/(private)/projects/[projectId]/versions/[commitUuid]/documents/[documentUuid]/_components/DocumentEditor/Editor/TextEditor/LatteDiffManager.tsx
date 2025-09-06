import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useMemo } from 'react'
import { useLatteChangeActions } from '$/hooks/latte'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useLatteStore } from '$/stores/latte'
import { useDevMode } from '$/hooks/useDevMode'
import { useLatteDiff } from '$/hooks/useLatteDiff'
import { ROUTES } from '$/services/routes'
import { useNavigate } from '$/hooks/useNavigate'
import {
  useCurrentProject,
  useCurrentCommit,
} from '@latitude-data/web-ui/providers'
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
  })

  const currentCheckpointIndex = useMemo(() => {
    if (!checkpoints.length) return -1
    return checkpoints.findIndex(
      (cp) => cp.documentUuid === document.documentUuid,
    )
  }, [checkpoints, document.documentUuid])

  const handleNavigateToCheckpoint = useCallback(
    (direction: 'prev' | 'next') => {
      if (!checkpoints.length || currentCheckpointIndex === -1) return

      const newIndex =
        direction === 'prev'
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
    } else if (updateDocumentContent) {
      // Optimistically update the document value to the previous value
      updateDocumentContent(diff?.oldValue, { origin: 'latteCopilot' })
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
  }, [acceptPartialChanges, document.documentUuid])

  if (!diff) return null
  if (!devMode) return null

  return (
    <div className='border flex flex-row gap-4 items-center bg-background rounded-xl p-1'>
      {checkpoints.length > 1 && (
        <div className='flex flex-1 flex-noShrink flex-row gap-1 items-center'>
          <Button
            size='small'
            variant='ghost'
            onClick={() => handleNavigateToCheckpoint('prev')}
            disabled={isBrewing || currentCheckpointIndex <= 0}
            iconProps={{
              name: 'chevronLeft',
            }}
          />
          <Text.H6M color='foregroundMuted' noWrap>
            {currentCheckpointIndex + 1} / {checkpoints.length}
          </Text.H6M>
          <Button
            size='small'
            variant='ghost'
            onClick={() => handleNavigateToCheckpoint('next')}
            disabled={
              isBrewing || currentCheckpointIndex >= checkpoints.length - 1
            }
            iconProps={{
              name: 'chevronRight',
            }}
          />
        </div>
      )}
      <div className='flex flex-row gap-2 items-center'>
        <Button
          size='small'
          variant='ghost'
          onClick={handlePartialRejectChange}
          disabled={isBrewing}
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
          disabled={isBrewing}
        >
          Keep
        </Button>
      </div>
    </div>
  )
}
