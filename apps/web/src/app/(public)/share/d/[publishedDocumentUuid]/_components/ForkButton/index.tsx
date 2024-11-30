import { forkDocumentAction } from '$/actions/documents/sharing/forkDocumentAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { PublishedDocument } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui'

// TODO: Implement fork action + job or go to fork page
// Show login modal if not currentUser
// const { currentUser } = useMaybeSession()

export function ForkButton({ shared }: { shared: PublishedDocument }) {
  const router = useNavigate()
  const { execute: fork, isPending: isForking } = useLatitudeAction(
    forkDocumentAction,
    {
      onSuccess: ({ data: { project, commit, document } }) => {
        const forkedUrl = ROUTES.share.document(shared.uuid!).forked({
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        }).root
        router.push(forkedUrl)
      },
    },
  )
  return (
    <Button
      fancy
      variant='outline'
      disabled={isForking}
      onClick={() => fork({ publishedDocumentUuid: shared.uuid! })}
      iconProps={
        isForking
          ? {
              name: 'loader',
              color: 'foreground',
              className: 'animate-spin',
            }
          : undefined
      }
    >
      {`${isForking ? 'Copying this prompt...' : 'Copy this prompt'}`}
    </Button>
  )
}
