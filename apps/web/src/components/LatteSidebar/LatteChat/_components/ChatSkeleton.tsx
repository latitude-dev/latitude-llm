import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'

export function ChatSkeleton() {
  return (
    <div className='flex flex-col h-full justify-between gap-8 p-8 w-full'>
      <div className='flex flex-col gap-8'>
        {/* User message skeleton */}
        <div className='flex flex-col gap-4 w-full relative'>
          <div className='flex flex-col p-4 gap-2 bg-latte-input rounded-2xl ml-auto max-w-[75%]'>
            <Skeleton className='w-48 h-5 bg-latte-input-foreground/20' />
            <Skeleton className='w-32 h-5 bg-latte-input-foreground/20' />
          </div>
        </div>

        {/* Assistant message skeleton */}
        <div className='flex flex-col gap-4 w-full relative'>
          <div className='flex flex-col gap-2 max-w-[75%]'>
            <Skeleton className='w-64 h-5' />
            <Skeleton className='w-56 h-5' />
            <Skeleton className='w-40 h-5' />
          </div>
        </div>

        {/* User message skeleton */}
        <div className='flex flex-col gap-4 w-full relative'>
          <div className='flex flex-col p-4 gap-2 bg-latte-input rounded-2xl ml-auto max-w-[75%]'>
            <Skeleton className='w-36 h-5 bg-latte-input-foreground/20' />
          </div>
        </div>

        {/* Assistant message skeleton with longer content */}
        <div className='flex flex-col gap-4 w-full relative'>
          <div className='flex flex-col gap-2 max-w-[75%]'>
            <Skeleton className='w-72 h-5' />
            <Skeleton className='w-64 h-5' />
            <Skeleton className='w-80 h-5' />
            <Skeleton className='w-48 h-5' />
          </div>
        </div>

        {/* User message skeleton */}
        <div className='flex flex-col gap-4 w-full relative'>
          <div className='flex flex-col p-4 gap-2 bg-latte-input rounded-2xl ml-auto max-w-[75%]'>
            <Skeleton className='w-52 h-5 bg-latte-input-foreground/20' />
            <Skeleton className='w-44 h-5 bg-latte-input-foreground/20' />
          </div>
        </div>

        {/* Assistant message skeleton */}
        <div className='flex flex-col gap-4 w-full relative'>
          <div className='flex flex-col gap-2 max-w-[75%]'>
            <Skeleton className='w-60 h-5' />
            <Skeleton className='w-68 h-5' />
          </div>
        </div>
      </div>

      {/* Chat input skeleton */}
      <div className='w-full'>
        <div className='pt-0 w-full relative flex flex-col gap-0'>
          <div className='relative'>
            <Skeleton className='w-full h-24 rounded-md border' />
            <div className='absolute bottom-2 right-2'>
              <Skeleton className='w-16 h-8 rounded-md' />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
