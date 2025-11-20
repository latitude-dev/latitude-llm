import { forkDocumentAction } from '$/actions/documents/sharing/forkDocumentAction'
import LoginFooter from '$/app/(public)/login/_components/LoginFooter'
import LoginForm from '$/app/(public)/login/LoginForm'
import SignupFooter from '$/app/(public)/setup/_components/SignupFooter'
import SetupForm from '$/app/(public)/setup/_components/SetupForm'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { useToggleModal } from '$/hooks/useToogleModal'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { ButtonProps } from '@latitude-data/web-ui/atoms/Button'
import { useMaybeSession } from '$/components/Providers/MaybeSessionProvider'
import { MouseEvent, useCallback, useState } from 'react'
import { PublishedDocument } from '@latitude-data/core/schema/models/types/PublishedDocument'

export function ForkButton({
  shared,
  variant = 'outline',
  fullWidth = false,
}: {
  shared: PublishedDocument
  variant?: ButtonProps['variant']
  fullWidth?: ButtonProps['fullWidth']
}) {
  const { currentUser } = useMaybeSession()
  const [form, setForm] = useState<'login' | 'signup'>('signup')
  const { open, onOpen, onOpenChange } = useToggleModal()
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
  const sharedUuid = shared.uuid!
  const onForkClick = useCallback(() => {
    if (!currentUser) {
      onOpen()
      return
    }

    fork({ publishedDocumentUuid: sharedUuid })
  }, [currentUser, fork, sharedUuid, onOpen])
  const onClickSignup = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    event.stopPropagation()

    setForm('signup')
  }, [])
  const onClickLogin = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    event.stopPropagation()

    setForm('login')
  }, [])
  const returnTo = ROUTES.share.document(shared.uuid!).fork
  return (
    <>
      <Button
        fancy
        variant={variant}
        disabled={isForking}
        fullWidth={fullWidth}
        onClick={onForkClick}
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
      <Modal
        dismissible
        open={open}
        onOpenChange={onOpenChange}
        size='small'
        title={form === 'signup' ? 'Sign up' : 'Log in'}
        description={
          form === 'signup'
            ? 'Sign up to copy this prompt'
            : 'Log in to copy this prompt'
        }
      >
        {form === 'signup' ? (
          <SetupForm
            returnTo={returnTo}
            footer={<SignupFooter onClickLogin={onClickLogin} />}
          />
        ) : null}
        {form === 'login' ? (
          <LoginForm
            returnTo={returnTo}
            footer={<LoginFooter onClickSignup={onClickSignup} />}
          />
        ) : null}
      </Modal>
    </>
  )
}
