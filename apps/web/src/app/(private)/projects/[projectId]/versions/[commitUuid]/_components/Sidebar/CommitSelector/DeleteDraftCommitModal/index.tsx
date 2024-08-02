import { useMemo } from 'react'

import { ConfirmModal, useCurrentProject } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useCommits from '$/stores/commitsStore'
import { ReactStateDispatch } from '$ui/lib/commonTypes'
import { useRouter } from 'next/navigation'

export default function DeleteDraftCommitModal({
  commitId,
  onClose,
}: {
  commitId: number | null
  onClose: ReactStateDispatch<number | null>
}) {
  const { data, destroyDraft, isDestroying } = useCommits({
    onSuccessDestroy: async () => {
      router.push(ROUTES.projects.detail({ id: project.id }).commits.latest)
      onClose(null)
    },
  })
  const commit = useMemo(() => data.find((c) => c.id === commitId), [commitId])

  const { project } = useCurrentProject()
  const router = useRouter()
  return (
    <ConfirmModal
      open={!!commit}
      title={`Delete ${commit?.title} version`}
      type='destructive'
      onOpenChange={() => onClose(null)}
      onConfirm={() => destroyDraft({ projectId: project.id, id: commitId! })}
      confirm={{
        label: 'Delete version',
        description:
          'Deleting this version means you will lose all modified, deleted, or created prompts. This action cannot be undone.',
        isConfirming: isDestroying,
      }}
    />
  )
}
