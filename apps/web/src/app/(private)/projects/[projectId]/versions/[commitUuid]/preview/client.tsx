'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { LatteLayout } from '$/components/LatteLayout'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export function Client() {
  return (
    <div className='flex-1 min-h-0'>
      <LatteLayout>
        <div className='flex flex-col h-full p-4'>
          <div className='flex flex-col items-center justify-center h-full gap-8'>
            <div className='flex flex-col gap-2 max-w-[75%]'>
              <Text.H4M centered>Add triggers</Text.H4M>
              <Text.H5 centered color='foregroundMuted'>
                Add triggers to run this project from a chat box, an event, a
                schedule…
              </Text.H5>
            </div>
            <div className='max-w-[75%] overflow-hidden rounded-2xl border'>
              <img src='/new_trigger.png' />
            </div>
            <Button
              variant='outline'
              onClick={() => alert('quieto parao')}
              fancy
            >
              Add trigger
            </Button>
          </div>
        </div>
      </LatteLayout>
    </div>
  )
}
