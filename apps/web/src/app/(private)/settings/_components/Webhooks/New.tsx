'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { MultiSelectInput } from '@latitude-data/web-ui/molecules/MultiSelectInput'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'
import useWebhooks from '$/stores/webhooks'
import useProjects from '$/stores/projects'
import { useFormAction } from '$/hooks/useFormAction'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { useState } from 'react'
import { useTestWebhook } from '$/hooks/useTestWebhook'

export default function NewWebhook() {
  const router = useRouter()
  const { create } = useWebhooks()
  const { data: projects } = useProjects()
  const { toast } = useToast()
  const [url, setUrl] = useState('')
  const { isTestingEndpoint, testEndpoint } = useTestWebhook({
    getUrl: () => url,
  })

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
              onClick={testEndpoint}
              disabled={!url || isTestingEndpoint}
            >
              {isTestingEndpoint ? 'Testing...' : 'Test Endpoint'}
            </Button>
          </div>

          <div className='py-2'>
            <MultiSelectInput
              maxCount={2}
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
