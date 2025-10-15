import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ROUTES } from '$/services/routes'
import { SelectionSubItem, getPathHint } from '../../SelectionSubItem'

export function SubAgentItem({
  agentPath,
  documentUuid,
  projectId,
  commitUuid,
  onRemove,
  disabled,
  description,
}: {
  agentPath: string
  documentUuid: string
  projectId: number
  commitUuid: string
  onRemove: () => void
  disabled: boolean
  description?: string
}) {
  const name = agentPath.split('/').pop() || ''
  const pathHint = getPathHint(agentPath)
  const href = ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid }).root
  const tooltipProps = !description ? { open: false } : {}

  return (
    <SelectionSubItem
      icon={<Icon name='bot' color='foregroundMuted' />}
      content={
        <Tooltip
          {...tooltipProps}
          trigger={
            <div className='flex flex-1 min-w-0'>
              <Text.H5 ellipsis noWrap>
                {pathHint && (
                  <>
                    <span className='text-foreground opacity-50'>
                      {pathHint}
                    </span>
                    {name}
                  </>
                )}
                {!pathHint && name}
              </Text.H5>
            </div>
          }
          side='top'
          align='start'
        >
          <div className='text-background'>
            {description}
          </div>
        </Tooltip>
      }
      href={href}
      actions={
        <Button
          disabled={disabled}
          variant='ghost'
          size='none'
          iconProps={{ name: 'trash', color: 'foregroundMuted' }}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        />
      }
    />
  )
}
