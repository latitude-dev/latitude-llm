import { useEffect, useMemo } from 'react'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useLatteStore } from '$/stores/latte/index'
import useLatteThreadCheckpoints from '$/stores/latteThreadCheckpoints'
import { useDocumentValue } from './useDocumentValueContext'

/**
 * Computes the diff between the previous and current content for Latte changes.
 * Returns an object with oldValue and newValue for diff visualization.
 */
export function useLatteDiff() {
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { threadUuid } = useLatteStore()
  const { data: checkpoints } = useLatteThreadCheckpoints({
    threadUuid,
    commitId: commit.id,
  })
  const { setDiffOptions } = useDocumentValue()

  const checkpoint = useMemo(() => {
    const cp = checkpoints.find(
      (checkpoint) => checkpoint.documentUuid === document.documentUuid,
    )

    if (!cp) return undefined
    if (cp.data?.deletedAt) return undefined
    if (document.content === cp.data?.content) return undefined

    return cp
  }, [document, checkpoints])

  const diff = useMemo(() => {
    return checkpoint
      ? {
          oldValue: checkpoint.data?.content ?? '',
          newValue: document.content ?? '',
        }
      : undefined
  }, [document.content, checkpoint])

  useEffect(() => {
    setDiffOptions((prev) => {
      if (diff) {
        // Update the diff with the latest latte changes
        return {
          ...diff,
          source: 'latte',
        }
      }

      // If the previous diff was from latte, remove it
      if (prev?.source === 'latte') return undefined

      // Otherwise, keep the previous diff
      return prev
    })
  }, [diff, setDiffOptions])

  return { diff }
}
