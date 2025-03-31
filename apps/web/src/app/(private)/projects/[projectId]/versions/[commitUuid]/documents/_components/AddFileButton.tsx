'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useNodeInput } from '@latitude-data/web-ui/sections'
import { EntityType } from '@latitude-data/web-ui/sections'

export function AddFileButton() {
  const { setNodeInput } = useNodeInput()

  return (
    <Button
      fancy
      variant='outline'
      fullWidth
      onClick={() => setNodeInput(EntityType.File)}
    >
      <div className='flex flex-col gap-1 p-4'>
        <Text.H4M>Create a prompt from scratch</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          Create your prompt manually from scratch, test, evaluate, and deploy
          it to production effortlessly.
        </Text.H5>
      </div>
    </Button>
  )
}
