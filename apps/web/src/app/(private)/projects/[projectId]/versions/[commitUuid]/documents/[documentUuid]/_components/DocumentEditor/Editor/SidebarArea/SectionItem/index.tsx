import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'

export function SectionItemLoader() {
  return (
    <div className='flex min-w-0 items-center gap-x-2 p-2'>
      <Skeleton height='h5' className='w-28' />
      <Skeleton height='h5' className='w-60' />
    </div>
  )
}
