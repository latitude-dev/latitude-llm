import { Alert } from '@latitude-data/web-ui/atoms/Alert'

export function ErrorMessage({ error }: { error: Error }) {
  return (
    <div className='flex flex-col gap-2'>
      <Alert title='Error' description={error.message} variant='destructive' />
    </div>
  )
}
