import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { useEffect } from 'react'
import { captureClientError } from '$/instrumentation-client'

export function ErrorMessage({ error }: { error: Error }) {
  useEffect(() => {
    captureClientError(error, { component: 'ChatWrapper.ErrorMessage' })
  }, [error])

  return (
    <div className='flex flex-col gap-2'>
      <Alert title='Error' description={error.message} variant='destructive' />
    </div>
  )
}
