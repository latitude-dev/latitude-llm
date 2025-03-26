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
import { useRouter } from 'next/navigation'
import useWebhooks from '$/stores/webhooks'
import useProjects from '$/stores/projects'
import { useFormAction } from '$/hooks/useFormAction'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { useState } from 'react'
import { testWebhookAction } from '$/actions/webhooks/testWebhook'

export default function NewWebhook() {
  const router = useRouter()
  const { create } = useWebhooks()
  const { data: projects } = useProjects()
  const { toast } = useToast()
  const [url, setUrl] = useState('')
  const [isTestingEndpoint, setIsTestingEndpoint] = useState(false)

  const handleTestEndpoint = async () => {
    if (!url) {
      toast({
        title: 'Error',
        description: 'Please enter a URL first',
        variant: 'destructive',
      })
      return
    }

    setIsTestingEndpoint(true)
    try {
      await testWebhookAction({ url })
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

  const { action: createAction } = useFormAction(create, {
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

  return (
    <Modal open onOpenChange={() => router.back()} title='Create Webhook'>
      <form action={createAction}>
        <FormWrapper>
          <Input required label='Name' name='name' />
          <div className='flex gap-2 items-end'>
            <div className='flex-1'>
              <Input
                required
                label='URL'
                name='url'
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <Button
              fancy
              variant='outline'
              type='button'
              onClick={handleTestEndpoint}
              disabled={!url || isTestingEndpoint}
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
            />
          </div>

          <SwitchInput
            label='Active'
            name='isActive'
            description='The webhook will start processing events right after creation'
            defaultChecked
          />

          <div className='flex justify-end gap-2 pt-4'>
            <Link href={ROUTES.settings.root}>
              <Button fancy variant='outline'>
                Cancel
              </Button>
            </Link>
            <Button fancy type='submit'>
              Create
            </Button>
          </div>
        </FormWrapper>
      </form>
    </Modal>
  )
}
