'use client'
import { useFormAction } from '$/hooks/useFormAction'
import { useTestWebhook } from '$/hooks/useTestWebhook'
import { ROUTES } from '$/services/routes'
import useProjects from '$/stores/projects'
import useWebhooks from '$/stores/webhooks'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { MultiSelect } from '@latitude-data/web-ui/molecules/MultiSelect'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useRef } from 'react'

export default function EditWebhook() {
  const router = useRouter()
  const params = useParams()
  const { data: webhooks, update, isUpdating } = useWebhooks()
  const { data: projects } = useProjects()
  const { toast } = useToast()

  const formRef = useRef<HTMLFormElement>(null)
  const { isTestingEndpoint, testEndpoint } = useTestWebhook({
    getUrl: () => formRef.current?.url?.value || null,
  })

  const webhook = webhooks?.find((w) => w.id === Number(params.id))

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
              onClick={testEndpoint}
              disabled={isTestingEndpoint}
            >
              {isTestingEndpoint ? 'Testing...' : 'Test Endpoint'}
            </Button>
          </div>

          <div className='py-2'>
            <MultiSelect
              maxCount={2}
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
