import { Button, FocusHeader } from '@latitude-data/web-ui'
import * as Sentry from '@sentry/nextjs'
import { FocusLayout } from '$/components/layouts'

export default function ErrorTestPage() {
  async function triggerServerError() {
    'use server'

    const error = new Error('This is a test server error')
    Sentry.captureException(error)
    throw error
  }

  return (
    <FocusLayout header={<FocusHeader title='Error test page' />}>
      <div className='flex flex-col items-center justify-center h-full'>
        <form action={triggerServerError}>
          <Button type='submit'>Trigger Server Error</Button>
        </form>
      </div>
    </FocusLayout>
  )
}
