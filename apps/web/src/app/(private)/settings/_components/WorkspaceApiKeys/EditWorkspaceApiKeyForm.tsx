'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@latitude-data/web-ui/atoms/Dialog'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Label } from '@latitude-data/web-ui/atoms/Label'
import useApiKeys from '$/stores/apiKeys'
import type { ApiKey } from '@latitude-data/core/browser'
import { useState } from 'react'

interface EditWorkspaceApiKeyFormProps {
  apiKey: ApiKey
  isOpen: boolean
  onClose: () => void
}

export default function EditWorkspaceApiKeyForm({
  apiKey,
  isOpen,
  onClose,
}: EditWorkspaceApiKeyFormProps) {
  const { update } = useApiKeys()
  const [name, setName] = useState(apiKey.name)

  const handleSubmit = async () => {
    await update({ id: apiKey.id, name })
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit API Key</DialogTitle>
          <DialogDescription>
            Update the name of your API key.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 py-4'>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label htmlFor='name' className='text-right'>
              Name
            </Label>
            <Input
              id='name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              className='col-span-3'
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
