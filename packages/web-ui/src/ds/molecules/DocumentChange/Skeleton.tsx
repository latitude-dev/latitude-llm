import { ModifiedDocumentType } from '@latitude-data/constants'
import { MODIFICATION_ICONS } from './colors'
import { Icon, IconName } from '../../atoms/Icons'
import { Skeleton } from '../../atoms/Skeleton'

export function DocumentChangeSkeleton({
  changeType = ModifiedDocumentType.Updated,
  width = 65,
}: {
  changeType: ModifiedDocumentType
  width: number
}) {
  const icon = MODIFICATION_ICONS[changeType]
  return (
    <div className='w-full flex flex-row items-center gap-x-1 px-2 min-h-8'>
      <Icon
        name={icon as IconName}
        className='flex-shrink-0 w-4 h-4 text-gray-400 animate-pulse'
      />
      <div className='flex-grow h-5'>
        <Skeleton
          className={'h-full bg-muted rounded-full'}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}
