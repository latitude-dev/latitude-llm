import { useMemo } from 'react'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useLatteStore } from '$/stores/latte/index'
import useLatteThreadCheckpoints from '$/stores/latteThreadCheckpoints'

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
    if (!checkpoint) return undefined

    return {
      oldValue: checkpoint.data?.content ?? '',
      newValue: document.content ?? '',
    }
  }, [document.content, checkpoint])

  return { diff }
}
