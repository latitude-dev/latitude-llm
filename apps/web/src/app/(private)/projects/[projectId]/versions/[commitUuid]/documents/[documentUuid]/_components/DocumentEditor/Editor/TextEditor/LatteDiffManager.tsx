import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCallback } from 'react'
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

export function LatteDiffManager() {
  const { acceptPartialChanges, undoPartialChanges: discardPartialChanges } =
    useLatteChangeActions()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const { isBrewing } = useLatteStore()
  const { updateDocumentContent } = useDocumentValue()
  const { devMode } = useDevMode()
  const { diff } = useLatteDiff()
  const handlePartialAcceptChange = useCallback(() => {
    acceptPartialChanges({
      documentUuids: [document.documentUuid],
    })
  }, [acceptPartialChanges, document.documentUuid])
  const navigate = useNavigate()
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

  if (!diff) return null
  if (!devMode) return null

  return (
    <div className='border flex flex-row gap-2 items-center bg-background rounded-xl p-1'>
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
  )
}
