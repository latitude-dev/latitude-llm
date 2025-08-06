'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'

export function LatitudeIntegrations() {
  return (
    <div className='flex flex-col gap-2'>
      <Text.H5M>Latitude Integrations</Text.H5M>
      <div className='space-y-2'>
        <div className='p-3 border rounded-md'>
          <p className='text-sm text-gray-600'>Placeholder for integration 1</p>
        </div>
        <div className='p-3 border rounded-md'>
          <p className='text-sm text-gray-600'>Placeholder for integration 2</p>
        </div>
      </div>
    </div>
  )
}
