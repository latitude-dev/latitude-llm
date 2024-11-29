import { Skeleton } from '@latitude-data/web-ui'

export function CommitItemSkeleton() {
  return (
    <div className='flex flex-col p-4 gap-y-2'>
      <div className='flex flex-col gap-y-1'>
        <div className='flex items-center justify-between'>
          <Skeleton height='h5' className='w-24' />
          <Skeleton height='h5' className='w-12' />
        </div>
        <Skeleton height='h6' className='w-10' />
      </div>
      <div className='flex gap-x-4'>
        <Skeleton height='h5' className='w-12' />
      </div>
    </div>
  )
}
