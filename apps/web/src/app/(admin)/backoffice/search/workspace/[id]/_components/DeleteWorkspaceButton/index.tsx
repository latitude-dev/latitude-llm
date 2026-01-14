'use client'

import { FormEvent, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { destroyWorkspaceAction } from '$/actions/admin/workspaces/destroy'
import { ROUTES } from '$/services/routes'

type Props = {
  workspaceId: number
  workspaceName: string
}

export function DeleteWorkspaceButton({ workspaceId, workspaceName }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const router = useRouter()
  const { toast } = useToast()

  const isConfirmationValid = confirmationText === workspaceName

  useEffect(() => {
    if (!isModalOpen) {
      setConfirmationText('')
    }
  }, [isModalOpen])

  const { execute, isPending } = useLatitudeAction(destroyWorkspaceAction, {
    onSuccess: () => {
      toast({
        title: 'Workspace Deleted',
        description: `Workspace "${workspaceName}" has been permanently deleted.`,
      })
      setIsModalOpen(false)
      router.push(ROUTES.backoffice.root)
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to delete workspace',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isConfirmationValid) return
    await execute({ workspaceId })
  }

  return (
    <>
      <Button
        fancy
        onClick={() => setIsModalOpen(true)}
        variant='destructive'
        disabled={isPending}
      >
        Delete Workspace
      </Button>
      <Modal
        dismissible
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title='Delete Workspace Permanently'
        description='This action cannot be undone. All data associated with this workspace will be permanently deleted, including projects, documents, evaluations, and logs.'
        footer={
          <>
            <CloseTrigger />
            <Button
              fancy
              form='deleteWorkspaceForm'
              type='submit'
              variant='destructive'
              disabled={isPending || !isConfirmationValid}
              isLoading={isPending}
            >
              Delete Workspace
            </Button>
          </>
        }
      >
        <form id='deleteWorkspaceForm' onSubmit={handleSubmit}>
          <FormWrapper>
            <div className='flex flex-col gap-4'>
              <div className='p-4 bg-destructive/10 border border-destructive/20 rounded-lg'>
                <Text.H5 color='destructive'>
                  Warning: This will permanently delete:
                </Text.H5>
                <ul className='mt-2 list-disc list-inside text-sm text-muted-foreground'>
                  <li>All projects and documents</li>
                  <li>All evaluations and results</li>
                  <li>All logs and telemetry data</li>
                  <li>All API keys and provider configurations</li>
                  <li>All memberships and user associations</li>
                </ul>
              </div>
              <Input
                label={`Type "${workspaceName}" to confirm`}
                name='confirmation'
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={workspaceName}
                autoComplete='off'
              />
            </div>
          </FormWrapper>
        </form>
      </Modal>
    </>
  )
}
