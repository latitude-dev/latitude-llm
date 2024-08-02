import { useMemo } from 'react'

import {
  ConfirmModal,
  useCurrentProject,
  useToast,
} from '@latitude-data/web-ui'
import { deleteDraftCommitAction } from '$/actions/commits/deleteDraftCommitAction'
import { ROUTES } from '$/services/routes'
import useCommits from '$/stores/commitsStore'
import { ReactStateDispatch } from '$ui/lib/commonTypes'
import { useRouter } from 'next/navigation'
import { useServerAction } from 'zsa-react'

export default function DeleteDraftCommitModal({
  commitId,
  onClose,
}: {
  commitId: number | null
  onClose: ReactStateDispatch<number | null>
}) {
  const { data, mutate } = useCommits()
  const { toast } = useToast()
  const commit = useMemo(() => data.find((c) => c.id === commitId), [commitId])
  const { project } = useCurrentProject()
  const router = useRouter()
  const { execute, isPending } = useServerAction(deleteDraftCommitAction, {
    persistErrorWhilePending: true,
    persistDataWhilePending: true,
    onSuccess: (result) => {
      const deletedDraft = result.data
      mutate(data.filter((item) => item.id !== deletedDraft.id))
      router.push(ROUTES.projects.detail({ id: project.id }).commits.latest)
      onClose(null)
    },
    onError: ({ err }) => {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      })
    },
  })
  return (
    <ConfirmModal
      open={!!commit}
      title={`Delete ${commit?.title} version`}
      type='destructive'
      onOpenChange={() => onClose(null)}
      onConfirm={() => execute({ projectId: project.id, id: commitId! })}
      confirm={{
        label: 'Delete version',
        description:
          'Deleting this version means you will lose all modified, deleted, or created prompts. This action cannot be undone.',
        isConfirming: isPending,
      }}
    />
  )
}
