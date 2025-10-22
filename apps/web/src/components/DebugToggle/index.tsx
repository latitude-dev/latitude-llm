import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { IconToggle } from '@latitude-data/web-ui/molecules/IconToggle'

export default function DebugToggle({
  enabled,
  setEnabled,
}: {
  enabled?: boolean
  setEnabled?: (enabled: boolean) => void
}) {
  return (
    <Tooltip
      asChild
      align='center'
      side='left'
      trigger={
        <div className='flex flex-row justify-center items-center'>
          <IconToggle
            enabled={enabled ?? false}
            setEnabled={setEnabled ?? (() => {})}
            enabledIcon='braces'
            disabledIcon='baseline'
          />
        </div>
      }
    >
      {enabled ? 'Switch to reading mode' : 'Switch to debug mode'}
    </Tooltip>
  )
}
