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

export default function PublishDraftCommitModal({
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
      type='primary'
      open={!!commit}
      title={`Publishing ${commit?.title}`}
      description='Publishing the version will publish all changes in your prompts to production. Review the changes carefully before publishing.'
      onOpenChange={() => onClose(null)}
      onConfirm={() => execute({ projectId: project.id, id: commitId! })}
      confirm={{
        label: 'Publish to production',
        description:
          'Publishing a new version will update all your prompts in production.',
        isConfirming: isPending,
      }}
    />
  )
}
