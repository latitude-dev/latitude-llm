import Link from 'next/link'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ROUTES } from '$/services/routes'

export function SubAgentItem({
  agentPath,
  documentUuid,
  projectId,
  commitUuid,
  onRemove,
  disabled,
}: {
  agentPath: string
  documentUuid: string
  projectId: number
  commitUuid: string
  onRemove: () => void
  disabled: boolean
}) {
  const name = agentPath.split('/').pop() || ''
  const href = ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid }).root

  return (
    <div
      role='button'
      tabIndex={0}
      aria-disabled={disabled}
      className='flex flex-row items-center rounded-md gap-3 min-w-0 p-2 hover:bg-backgroundCode group'
    >
      <Link href={href} className='flex items-center gap-3 flex-1 min-w-0'>
        <Icon name='bot' color='foregroundMuted' />
        <div className='flex-1 min-w-0'>
          <Text.H5 ellipsis noWrap>
            {name}
          </Text.H5>
        </div>
      </Link>
      <Button
        disabled={disabled}
        variant='ghost'
        size='small'
        className='opacity-0 group-hover:opacity-100 transition'
        iconProps={{ name: 'trash', color: 'foregroundMuted' }}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      />
    </div>
  )
}
