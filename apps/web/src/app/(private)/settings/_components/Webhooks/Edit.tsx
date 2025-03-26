'use client'

import {
  Button,
  FormWrapper,
  Input,
  Modal,
  MultiSelect,
  SwitchInput,
  useToast,
} from '@latitude-data/web-ui'
import { useRouter, useParams } from 'next/navigation'
import useWebhooks from '$/stores/webhooks'
import { useFormAction } from '$/hooks/useFormAction'
import useProjects from '$/stores/projects'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { useState, useRef } from 'react'
import { testWebhookAction } from '$/actions/webhooks/testWebhook'

export default function EditWebhook() {
  const router = useRouter()
  const params = useParams()
  const { data: webhooks, update, isUpdating } = useWebhooks()
  const { data: projects } = useProjects()
  const { toast } = useToast()
  const [isTestingEndpoint, setIsTestingEndpoint] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const webhook = webhooks?.find((w) => w.id === Number(params.id))

  const handleTestEndpoint = async () => {
    if (!formRef.current) return

    const formData = new FormData(formRef.current)
    const url = formData.get('url') as string

    if (!url) {
      toast({
        title: 'Error',
        description: 'No URL available to test',
        variant: 'destructive',
      })
      return
    }

    setIsTestingEndpoint(true)
    try {
      const [_, error] = await testWebhookAction({ url })
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Test webhook was sent successfully',
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to test webhook',
        variant: 'destructive',
      })
    } finally {
      setIsTestingEndpoint(false)
    }
  }

  const { action: updateAction } = useFormAction(update, {
    onSuccess: () => {
      router.back()
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Transform projects for MultiSelect
  const projectOptions =
    projects?.map((project) => ({
      label: project.name,
      value: project.id.toString(),
    })) || []

  if (!webhook) {
    return null
  }

  return (
    <Modal
      open
      onOpenChange={() => router.push(ROUTES.settings.root)}
      title='Edit Webhook'
      description='Edit the webhook to update the name, URL, and projects.'
      footer={
        <div className='flex justify-end gap-2 pt-4'>
          <Link href={ROUTES.settings.root}>
            <Button fancy variant='outline'>
              Cancel
            </Button>
          </Link>
          <Button
            fancy
            type='submit'
            form='edit-webhook-form'
            disabled={isUpdating}
          >
            Update
          </Button>
        </div>
      }
    >
      <form ref={formRef} id='edit-webhook-form' action={updateAction}>
        <FormWrapper>
          <Input label='Name' name='name' defaultValue={webhook.name} />
          <div className='flex gap-2 items-end'>
            <div className='flex-1'>
              <Input label='URL' name='url' defaultValue={webhook.url} />
            </div>
            <Button
              fancy
              variant='outline'
              type='button'
              onClick={handleTestEndpoint}
              disabled={isTestingEndpoint}
            >
              {isTestingEndpoint ? 'Testing...' : 'Test Endpoint'}
            </Button>
          </div>

          <div className='py-2'>
            <MultiSelect
              description='You can filter webhook events by project to limit the scope of the notifications.'
              info='Leave empty to apply to all projects'
              label='Projects'
              name='projectIds'
              options={projectOptions}
              defaultValue={webhook.projectIds?.map(String)}
            />
          </div>

          <SwitchInput
            label='Active'
            name='isActive'
            defaultChecked={webhook.isActive}
          />

          <Input hidden name='id' defaultValue={webhook.id} />
        </FormWrapper>
      </form>
    </Modal>
  )
}
