'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useApiKeys from '$/stores/apiKeys'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ROUTES } from '$/services/routes'

export default function NewApiKeyPage() {
  const router = useRouter()
  const { create } = useApiKeys()
  const [name, setName] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await create({ name })
    router.push(ROUTES.settings.root) // Redirect to settings page after creation
  }

  return (
    <div className='container mx-auto py-8'>
      <Text.H2>Create New API Key</Text.H2>
      <form onSubmit={handleSubmit} className='mt-4 space-y-4 max-w-md'>
        <div>
          <Label htmlFor='name'>API Key Name</Label>
          <Input
            id='name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='My new API key'
            required
          />
        </div>
        <div className='flex gap-2'>
          <Button type='submit'>Create API Key</Button>
          <Button
            variant='outline'
            onClick={() => router.push(ROUTES.settings.root)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
