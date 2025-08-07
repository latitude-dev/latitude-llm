import * as Sentry from '@sentry/nextjs'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { useEffect } from 'react'

export function ErrorMessage({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className='flex flex-col gap-2'>
      <Alert title='Error' description={error.message} variant='destructive' />
    </div>
  )
}
