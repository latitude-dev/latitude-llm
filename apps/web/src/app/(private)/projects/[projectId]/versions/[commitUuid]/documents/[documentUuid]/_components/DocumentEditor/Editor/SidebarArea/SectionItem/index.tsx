import { ReactNode } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'

export function SectionItemLoader() {
  return (
    <div className='flex min-w-0 items-center gap-x-2 p-2'>
      <Skeleton height='h5' className='w-28' />
      <Skeleton height='h5' className='w-60' />
    </div>
  )
}

export function SectionItem({
  image,
  title,
  description,
}: {
  title: string
  description?: string
  image: ReactNode
}) {
  return (
    <div className='flex min-w-0 items-center gap-x-2 p-2'>
      <div>{image}</div>
      <div className='shrink-0 max-w-40 min-w-0 flex'>
        <Text.H5 ellipsis noWrap>
          {title}
        </Text.H5>
      </div>

      {description ? (
        <Text.H5 ellipsis noWrap color='foregroundMuted'>
          {description}
        </Text.H5>
      ) : null}
    </div>
  )
}
