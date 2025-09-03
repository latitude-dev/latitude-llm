import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useLatteChangeActions } from '$/hooks/latte/useLatteChangeActions'
import { useNavigate } from '$/hooks/useNavigate'
import { useEvents } from '$/lib/events'
import { ROUTES } from '$/services/routes'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useMemo, useRef } from 'react'
import { useDocumentValue } from './useDocumentValueContext'
import { useDevMode } from './useDevMode'

export function useSyncLatteChanges() {
  const router = useNavigate()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const { changes } = useLatteChangeActions()
  const { devMode, setDevMode } = useDevMode()
  const { value: content, updateDocumentContent } = useDocumentValue()
  const change = useMemo(() => {
    const change = changes.find(
      (change) =>
        change.draftUuid === commit.uuid &&
        change.current.documentUuid === document.documentUuid,
    )

    if (!change) {
      return undefined
    }

    if (change.current.deletedAt) {
      return undefined
    }

    if (change.previous?.content === content) {
      return undefined
    }

    return change
  }, [content, changes, commit, document])
  const diff = useMemo(() => {
    if (!change) {
      return undefined
    }

    return {
      oldValue: change.previous?.content ?? '',
      newValue: content,
    }
  }, [content, change])

  const simpleMode = useRef<boolean>()
  const goToDevEditor = useCallback(() => {
    if (devMode) return
    simpleMode.current = true
    setDevMode(true)
  }, [devMode, setDevMode])
  const backToPrevEditor = useCallback(() => {
    if (!simpleMode.current) return
    simpleMode.current = false
    setDevMode(false)
  }, [setDevMode])

  useEvents(
    {
      onLatteProjectChanges: ({ changes }) => {
        const updatedDocument = changes.find(
          (change) =>
            change.draftUuid === commit.uuid &&
            change.current.documentUuid === document.documentUuid,
        )?.current
        if (!updatedDocument) return

        if (updatedDocument.deletedAt) {
          const base = ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
          router.push(base.preview.root)
          return
        }

        if (updatedDocument.content !== document.content) {
          updateDocumentContent(updatedDocument.content, {
            origin: 'latteCopilot',
          })
          goToDevEditor()
        }
      },
      onLatteChangesAccepted: () => backToPrevEditor(),
      onLatteChangesRejected: () => backToPrevEditor(),
    },
    [document.documentUuid, document.commitId],
  )

  return { diff }
}
